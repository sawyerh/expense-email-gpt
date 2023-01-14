/**
 * @file Lambda handler that receives an S3 object creation event
 */
import type { S3Event, S3Handler } from "aws-lambda";
import { Configuration, OpenAIApi } from "openai";
import { S3 } from "@aws-sdk/client-s3";
import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";
import { simpleParser } from "mailparser";
import { GoogleSpreadsheet } from "google-spreadsheet";

dayjs.extend(utc);
dayjs.extend(timezone);

export const handler: S3Handler = async (event: S3Event) => {
  const { from, date, text, subject } = await getEmailFromS3(event);
  const fromEmail = from?.value[0].address;

  if (!text) throw new Error("No email text found");

  if (fromEmail !== process.env.SENDING_EMAIL) {
    console.warn("Ignoring email from:", fromEmail);
    return;
  }

  const rowData = {
    Amount: "",
    "Sent to": "",
    "Email date": dayjs(date).tz("America/Los_Angeles").format("YYYY-MM-DD Z"),
    Details: "",
    "AI completion": "",
  };

  try {
    const { amount, completion, details, to } = await getExpenseDetails(text);
    rowData.Amount = amount;
    rowData["Sent to"] = to;
    rowData["Details"] = details ?? "";
    rowData["AI completion"] = completion;
  } catch (error) {
    rowData.Amount = `Error parsing ${subject}`;
    rowData["Sent to"] =
      error instanceof Error ? error.message : "Unknown error";
  }

  const doc = new GoogleSpreadsheet(process.env.SHEET_ID);
  await doc.useServiceAccountAuth({
    client_email: process.env.GOOGLE_SERVICE_CLIENT_EMAIL ?? "",
    private_key: process.env.GOOGLE_SERVICE_PRIVATE_KEY ?? "",
  });
  await doc.loadInfo();
  const sheet = doc.sheetsByTitle["Expenses"];
  await sheet.addRow(rowData);
};

async function getEmailFromS3(event: S3Event) {
  const { bucket, object } = event.Records[0].s3;
  console.log("Reading email saved at:", bucket.name, object.key);

  const s3 = new S3({ region: event.Records[0].awsRegion });
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

  const completion = response.data.choices[0].text;
  if (!completion) throw new Error("No completion from OpenAI");

  console.log("Completion:", completion);

  const amount = completion.match(/Amount: (.+?), To/)?.[1].replace("$", "");
  const to = completion.match(/To: (.+?),/)?.[1];
  const details = completion.match(/Details: (.+)/)?.[1].replace("N/A", "");

  if (!amount) throw new Error("No 'Amount' found in completion");
  if (!to) throw new Error("No 'To' found in completion");

  return { amount, completion, details, to };
}
