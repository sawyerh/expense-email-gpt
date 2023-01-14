/**
 * @file Lambda handler that receives an S3 object creation event
 */
import type { Callback, Context, S3Event, S3Handler } from "aws-lambda";
import { S3 } from "@aws-sdk/client-s3";
import dayjs from "dayjs";
import { simpleParser } from "mailparser";
import { GoogleSpreadsheet } from "google-spreadsheet";

export const handler: S3Handler = async (
  event: S3Event,
  context: Context,
  callback: Callback
) => {
  const { date, text, subject } = await getEmailFromS3(event);

  // TODO: Parse email using GPTf

  const doc = new GoogleSpreadsheet(process.env.SHEET_ID);
  await doc.useServiceAccountAuth({
    client_email: process.env.GOOGLE_SERVICE_CLIENT_EMAIL ?? "",
    private_key: process.env.GOOGLE_SERVICE_PRIVATE_KEY ?? "",
  });

  await doc.loadInfo();

  const sheet = doc.sheetsByTitle["Expenses"];
  await sheet.addRow({
    Date: dayjs(date).format("YYYY-MM-DDTHH:mm:ssZ"),
    Amount: "1.20",
    From: "TODO",
  });
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
