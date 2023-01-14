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
  const { date, text, subject } = await getEmailFromS3(event);
  if (!text) throw new Error("No email text found");

  const rowData = {
    Date: dayjs(date).tz("America/Los_Angeles").format("YYYY-MM-DD Z"),
    Amount: "",
    From: "",
  };

  try {
    const { amount, from } = await getExpenseDetails(text);
    rowData.Amount = amount;
    rowData.From = from;
  } catch (error) {
    rowData.Amount = `Error parsing ${subject}`;
    rowData.From = error instanceof Error ? error.message : "Unknown error";
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

  return await simpleParser(parseableBody);
}

async function getExpenseDetails(body: string) {
  const openai = new OpenAIApi(
    new Configuration({
      apiKey: process.env.OPEN_AI_KEY,
    })
  );

  const prompt = `The following is a forwarded expense email.
How much is the expense for in dollars, and who charged the expense? Respond in the format: "Amount: <amount>, From: <from>"
For example: "Amount: 1.20, From: Acme Corp"
${body}`;

  const response = await openai.createCompletion({
    prompt,
    model: "text-davinci-003",
    temperature: 0.1,
    max_tokens: 3000,
  });

  const completion = response.data.choices[0].text;
  if (!completion) throw new Error("No completion from OpenAI");

  console.log("Completion:", completion);

  const amount = completion.match(/Amount: (.+?), From/)?.[1].replace("$", "");
  const from = completion.match(/From: (.+)/)?.[1];

  if (!amount) throw new Error("No 'Amount' found in completion");
  if (!from) throw new Error("No 'From' found in completion");

  return { amount, from };
}
