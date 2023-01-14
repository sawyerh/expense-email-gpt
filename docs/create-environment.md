# Creating a new environment

Follow these instructions to create a new environment in AWS. You should have at least one environment, and may want multiple environments for different purposes (e.g. development, production).

**Prerequisites**

- AWS account
- [AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html)
- Domain name
- Node.js
- Docker
- Google Service Account
- Open AI API key

### Install and configure your local environment

1. Copy `.env.example` to `.env` and update its values
1. Install dependencies: `npm install`
1. Update `lib/reader.ts` with your own Lambda code. (Or do an initial run through with what's already in there, which will output some of the email's details to CloudWatch Logs).

### Manually create an AWS SES rule set

SES only allows one rule set to be active at a time. If you already have a rule set, you can use it. Otherwise, you'll need to follow these steps:

1. [Create an SES rule set](https://docs.aws.amazon.com/ses/latest/dg/receiving-email-receipt-rules-console-walkthrough.html)
1. Set the rule set to **Active**.
1. Set the `SES_RULE_SET_NAME` environment variable in `.env` to the name of the rule set.

### Deploy to AWS

[AWS CDK](https://aws.amazon.com/cdk/) is used for managing the AWS infrastructure as code. It also handles the compilation and deployment of the Lambda function.

<details>
   <summary>More detail about the CDK CLI</summary>
   The `cdk` CLI is installed as part of the project's dependencies (so should already be installed at this point in the instructions). There are a number of `npm` scripts setup for executing common CDK commands (see `package.json`), and you can execute all `cdk` commands using `npx cdk` (i.e. `npx cdk destroy`).
</details>

1. [Authenticate the AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-quickstart.html)
1. [Bootstrap](https://docs.aws.amazon.com/cdk/latest/guide/bootstrapping.html) the AWS environment:

   ```sh
   npx cdk bootstrap
   ```

1. Optional: Preview the AWS changes to be deployed:

   ```sh
   npm run diff
   ```

1. Deploy everything to AWS:

   ```sh
   npm run deploy
   ```

### Verify your email domain

This step is only necessary if you are using a new domain that has not been verified in AWS SES already.

<details>
 <summary>More detail about SES and domain verification</summary>

In Amazon SES, a [verified identity](https://docs.aws.amazon.com/ses/latest/dg/creating-identities.html#verify-domain-procedure) is a domain that you use to send or receive email.

Before you can receive an email using Amazon SES, you must create and verify each identity that you're going to use. You must complete the verification process with your DNS provider.

</details>

1. When the stack is deployed following the prior section's steps, it will output the CNAME and MX records that you need to add to your domain's DNS records in order to verify SES is able to receive emails on its behalf.
1. Add the CNAME and MX records to your domain’s DNS settings.

You can check the verification status of your domain in the "Verified identities" section of the AWS SES console page. You should also receive an email when the verification is complete.
