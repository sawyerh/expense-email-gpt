#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { ReaderStack } from "../lib/stacks/reader-stack";
import { SesIdentityStack } from "../lib/stacks/ses-identity-stack";

// https://docs.aws.amazon.com/cdk/latest/guide/environments.html
const env = {
  account: process.env.CDK_DEPLOY_ACCOUNT,
  region: process.env.CDK_DEPLOY_REGION,
};

const app = new cdk.App();
const prefix = process.env.STACK_PREFIX ? `${process.env.STACK_PREFIX}-` : "";

new ReaderStack(app, `${prefix}Reader`, { env });

if (process.env.SES_SKIP_DOMAIN_IDENTITY_CREATION !== "true") {
  new SesIdentityStack(app, `${prefix}Identity`, { env });
}
