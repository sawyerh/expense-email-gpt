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
const domain = process.env.RECEIVING_EMAIL?.split("@")[1] || "";

new ReaderStack(app, `${prefix}Reader`, { domain, env });

if (process.env.SES_SKIP_DOMAIN_IDENTITY_CREATION !== "true") {
  new SesIdentityStack(app, `${prefix}Identity`, { domain, env });
}
