/**
 * @file Lambda handler that reads the email from S3, parses it,
 *       and adds its details to a Google Sheet
 */
import type { S3Event, S3Handler } from "aws-lambda";
import OpenAI from "openai";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import { S3 } from "@aws-sdk/client-s3";
import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";
import { simpleParser } from "mailparser";
import { GoogleSpreadsheet } from "google-spreadsheet";
import {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources";

dayjs.extend(utc);
dayjs.extend(timezone);

interface ParseExpenseResponseArgs {
  to: string;
  amount: string;
  billing_date?: string;
  domain_name?: string;
}

export const handler: S3Handler = async (event: S3Event) => {
  const region = event.Records[0].awsRegion;
  const { from, date, text, subject } = await getEmailFromS3(event, region);
  const fromEmail = from?.value[0].address;

  if (!text) throw new Error("No email text found");
  if (!date) throw new Error("No email date found");
  if (!fromEmail || fromEmail !== process.env.SENDING_EMAIL) {
    console.warn("Ignoring email from:", fromEmail);
    return;
  }

  const replyParams = {
    region,
    to: fromEmail,
    subject: subject ?? "Re: Expense parsing",
  };

  try {
    const expenseDetails = await getExpenseDetails(text);
    const row = await addRowToSheet(expenseDetails, date);
    await sendReply(replyParams, row);
  } catch (error) {
    // Don't throw the error, otherwise the function will retry
    console.error(error);
    if (error instanceof Error) await sendReply(replyParams, error);
  }
};

async function addRowToSheet(
  expenseDetails: ParseExpenseResponseArgs,
  emailDate: Date
) {
  // These keys need to match the column headings in the Google Sheet
  const row = {
    Amount: expenseDetails.amount,
    "Sent to": expenseDetails.to,
    "Email date": dayjs(emailDate)
      .tz("America/Los_Angeles")
      .format("YYYY-MM-DD Z"),
    Details: `${[
      expenseDetails.billing_date ?? "",
      expenseDetails.domain_name ?? "",
    ]
      .filter((d) => !!d)
      .join(", ")}`,
  };

  const doc = new GoogleSpreadsheet(process.env.SHEET_ID);
  await doc.useServiceAccountAuth({
    client_email: process.env.GOOGLE_SERVICE_CLIENT_EMAIL ?? "",
    private_key: process.env.GOOGLE_SERVICE_PRIVATE_KEY ?? "",
  });
  await doc.loadInfo();
  const sheet = doc.sheetsByTitle["Expenses"];
  await sheet.addRow(row);

  return row;
}

async function getEmailFromS3(event: S3Event, region: string) {
  const { bucket, object } = event.Records[0].s3;
  console.log("Reading email saved at:", bucket.name, object.key);

  const s3 = new S3({ region });
  const { Body } = await s3.getObject({
    Bucket: bucket.name,
    Key: object.key,
  });

  if (!Body) throw new Error("No file body found");
  const parseableBody =
    typeof Body === "string"
      ? Body
      : Buffer.from(await Body.transformToByteArray());

  return await simpleParser(parseableBody, {
    skipImageLinks: true,
    skipHtmlToText: true,
  });
}

async function getExpenseDetails(body: string) {
  const openai = new OpenAI({
    apiKey: process.env.OPEN_AI_KEY,
  });

  const messages: ChatCompletionMessageParam[] = [
    {
      role: "system",
      content:
        "You are an expense tracking assistant. Parse expense details from the email content the user provides. Do not make up numbers or names.",
    },
    {
      role: "user",
      content: "Here is an expense email, parse and record the details",
    },
    {
      role: "user",
      content: body,
    },
  ];

  const tools: ChatCompletionTool[] = [
    {
      type: "function",
      function: {
        name: "parse_expense",
        description: "Record the parsed expense details",
        parameters: {
          type: "object",
          properties: {
            to: {
              type: "string",
              description:
                "The recipient of the expense. This is usually a company name.",
            },
            amount: {
              type: "string",
              description: "The dollar amount of the expense.",
            },
            billing_date: {
              type: "string",
              description:
                "The date the expense was billed, in ISO format (YYYY-MM-DD). If no date is present, leave this blank",
            },
            domain_name: {
              type: "string",
              description:
                "If this expense is for a domain name, record the domain name here.",
            },
          },
        },
      },
    },
  ];

  const response = await openai.chat.completions.create({
    messages,
    model: "gpt-3.5-turbo",
    temperature: 0.1,
    tools,
    tool_choice: {
      type: "function",
      function: {
        name: "parse_expense",
      },
    },
  });

  if (!response.choices.length) throw new Error("No choices in chat response");
  if (!response.choices[0].message.tool_calls?.length)
    throw new Error("No tool calls in chat response");

  const responseArgs = JSON.parse(
    response.choices[0].message.tool_calls[0].function.arguments
  ) as ParseExpenseResponseArgs;

  console.log("functionCallArgs:", responseArgs);

  return responseArgs;
}

async function sendReply(
  { region, to, subject }: { region: string; to: string; subject: string },
  data: Awaited<ReturnType<typeof addRowToSheet>> | Error
) {
  let body = "";
  let rowAsString = "";

  if (data instanceof Error) {
    body = `There was an error parsing this expense: ${data.message}`;
  } else {
    for (const [key, value] of Object.entries(data)) {
      rowAsString += `<strong>${key}</strong>: ${value}<br />`;
    }
    body = `Recorded the following:\n${rowAsString}`;
  }

  const ses = new SESClient({ region });
  const params = {
    Destination: {
      ToAddresses: [to],
    },
    Source: process.env.RECEIVING_EMAIL,
    Message: {
      Body: {
        Html: {
          Data: body,
        },
      },
      Subject: {
        Data: subject,
      },
    },
  };

  try {
    await ses.send(new SendEmailCommand(params));
    console.log("Email reply sent");
  } catch (error) {
    // Sending a reply is not critical, so just log the error
    console.error(error);
  }
}
