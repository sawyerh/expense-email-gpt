import * as cdk from "aws-cdk-lib";
import {
  aws_lambda as lambda,
  aws_lambda_nodejs as nodeLambda,
  aws_s3 as s3,
  aws_s3_notifications as s3Notifications,
} from "aws-cdk-lib";
import path = require("path");
import { Construct } from "constructs";
import { getAwsId } from "../utils/getAwsId";
import { getEnv } from "../utils/getEnv";

const env = getEnv();

interface Props {
  bucket: s3.Bucket;
  objectKeyPrefix?: string;
}

export class LambdaS3Reader extends Construct {
  lambda: nodeLambda.NodejsFunction;

  /**
   * Lambda for reading the emails from S3 when created
   */
  constructor(scope: Construct, { bucket, objectKeyPrefix }: Props) {
    super(scope, getAwsId());

    this.lambda = new nodeLambda.NodejsFunction(this, getAwsId("ReaderFn"), {
      description: "Reads the email object added to S3",
      entry: path.join(__dirname, "../reader.ts"),
      environment: {
        GOOGLE_SERVICE_CLIENT_EMAIL: env.GOOGLE_SERVICE_CLIENT_EMAIL,
        GOOGLE_SERVICE_PRIVATE_KEY: env.GOOGLE_SERVICE_PRIVATE_KEY,
        SHEET_ID: env.SHEET_ID,
      },
      runtime: lambda.Runtime.NODEJS_18_X,
      memorySize: 512,
      timeout: cdk.Duration.seconds(60),
      logRetention: cdk.aws_logs.RetentionDays.TWO_MONTHS,
      bundling: {
        minify: true,
        logLevel: nodeLambda.LogLevel.INFO,
      },
    });

    bucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3Notifications.LambdaDestination(this.lambda),
      {
        prefix: objectKeyPrefix,
      }
    );
  }
}
