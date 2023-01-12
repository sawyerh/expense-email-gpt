/**
 * @file Lambda handler that receives an S3 object creation event
 */
import type { Callback, Context, S3Event, S3Handler } from "aws-lambda";
import { S3 } from "@aws-sdk/client-s3";
import { simpleParser } from "mailparser";

export const handler: S3Handler = async (
  event: S3Event,
  context: Context,
  callback: Callback
) => {
  const email = await getEmailFromS3(event);

  // Put your code below, this is just here to demonstrate the email object.
  // There's a corresponding test in `tests/reader.test.ts` too.
  const { subject, text, html, attachments } = email;

  console.log("Read email:", subject);
  callback(undefined, { subject, text, html });
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
