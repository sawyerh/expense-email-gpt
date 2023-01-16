/**
 * @file Lambda handler that reads the email from S3, parses it,
 *       and adds its details to a Google Sheet
 */
import type { S3Event, S3Handler } from "aws-lambda";
import { Configuration, OpenAIApi } from "openai";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import { S3 } from "@aws-sdk/client-s3";
import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";
import { simpleParser } from "mailparser";
import { GoogleSpreadsheet } from "google-spreadsheet";

dayjs.extend(utc);
dayjs.extend(timezone);

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
    console.error(error);
    if (error instanceof Error) await sendReply(replyParams, error);
    throw error;
  }
};

async function addRowToSheet(
  expenseDetails: Awaited<ReturnType<typeof getExpenseDetails>>,
  emailDate: Date
) {
  // These keys need to match the column headings in the Google Sheet
  const row = {
    Amount: expenseDetails.amount,
    "Sent to": expenseDetails.to,
    "Email date": dayjs(emailDate)
      .tz("America/Los_Angeles")
      .format("YYYY-MM-DD Z"),
    Details: expenseDetails.details ?? "",
    "AI completion": expenseDetails.completion,
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
  const openai = new OpenAIApi(
    new Configuration({
      apiKey: process.env.OPEN_AI_KEY,
    })
  );

  const prompt = `The following is a forwarded expense email.
How much is the expense for in dollars, and who was the money sent to?
Include the expense date in the details field.
If the expense is for a domain name, also include the domain name in the details field.
If there are no details, use "N/A" in the details field.
Respond in the format: "Amount: <amount>, To: <sent to>, Details: <details>"
Below are examples of desired responses:
Example 1: "Amount: 1.20, To: Acme Corp, Details: 2021-12-25"
Example 2: "Amount: 34.98, To: Netlify, Details: 2023-01-31 foo.com"
Example 3: "Amount: 34.98, To: Netlify, Details: N/A"
${body}`;

  const response = await openai.createCompletion({
    prompt,
    model: "text-davinci-003",
    temperature: 0.1,
    max_tokens: 256,
  });

  const completion = response.data.choices[0].text?.trim();
  if (!completion) throw new Error("No completion from OpenAI");

  console.log("Completion:", completion);

  const amount = completion.match(/Amount: (.+?), To/)?.[1].replace("$", "");
  const to = completion.match(/To: (.+?),/)?.[1];
  const details = completion.match(/Details: (.+)/)?.[1].replace("N/A", "");

  if (!amount)
    throw new Error(`No 'Amount' found in completion: ${completion}`);
  if (!to) throw new Error(`No 'To' found in completion: ${completion}`);

  return { amount, completion, details, to };
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
    const data = await ses.send(new SendEmailCommand(params));
    console.log("Email reply sent");
  } catch (error) {
    // Sending a reply is not critical, so just log the error
    console.error(error);
  }
}
