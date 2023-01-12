#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { EmailReaderStack } from "../lib/stacks/email-reader-stack";
import { EmailAddressStack } from "../lib/stacks/email-address-stack";
import { getAwsId } from "../lib/utils/getAwsId";

// https://docs.aws.amazon.com/cdk/latest/guide/environments.html
const env = {
  account: process.env.CDK_DEPLOY_ACCOUNT,
  region: process.env.CDK_DEPLOY_REGION,
};

const app = new cdk.App();

new EmailReaderStack(app, getAwsId("Reader"), { env });

if (process.env.SES_SKIP_DOMAIN_IDENTITY_CREATION !== "true") {
  new EmailAddressStack(app, getAwsId("EmailAddress"), { env });
}
