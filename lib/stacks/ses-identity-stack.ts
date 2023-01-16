/**
 * @file Separate AWS stack specifically for the SES domain identity. Some projects may share a domain
 * identity across multiple apps, so having the domain as its own stack allows it to be conditionally
 * created, and for the other AWS resources to be destroyed without affecting the domain identity.
 */
import * as cdk from "aws-cdk-lib";
import { aws_ses as ses } from "aws-cdk-lib";
import { getEnv } from "../utils/getEnv";

const env = getEnv();

interface Props extends cdk.StackProps {
  domain: string;
}

export class SesIdentityStack extends cdk.Stack {
  /**
   * Create AWS SES domain identity so we can receive emails to the desired email address.
   * This domain will require verification using the DNS records output after deploying this stack.
   */
  constructor(scope: cdk.App, id: string, props: Props) {
    super(scope, id, props);

    const domainIdentity = new ses.EmailIdentity(this, "Domain", {
      identity: ses.Identity.domain(props.domain),
    });

    /**
     * Output to the CLI the CNAME records used for verifying the domain
     */
    new cdk.CfnOutput(this, "CNAME", {
      value: `\n
CNAME records:\n
Name: ${domainIdentity.dkimDnsTokenName1}\nValue: ${domainIdentity.dkimDnsTokenValue1}\n
Name: ${domainIdentity.dkimDnsTokenName2}\nValue: ${domainIdentity.dkimDnsTokenValue2}\n
Name: ${domainIdentity.dkimDnsTokenName3}\nValue: ${domainIdentity.dkimDnsTokenValue3}\n`,
    });
    new cdk.CfnOutput(this, "MX", {
      value: `\n
MX record:\n
Name: ${props.domain}\nValue: inbound-smtp.${env.CDK_DEPLOY_REGION}.amazonaws.com
Priority: 10\n`,
    });
  }
}
