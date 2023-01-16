import * as cdk from "aws-cdk-lib";
import {
  aws_s3 as s3,
  aws_ses as ses,
  aws_ses_actions as sesActions,
} from "aws-cdk-lib";
import { LambdaS3Reader } from "../constructs/LambdaS3Reader";
import { getEnv } from "../utils/getEnv";

const env = getEnv();

export class ReaderStack extends cdk.Stack {
  /**
   * Create AWS resources required for storing and taking action on emails received
   */
  constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    const recipients = [env.RECEIVING_EMAIL];

    /**
     * S3 bucket for storing emails
     */
    const bucket = new s3.Bucket(this, "Inbox", {
      lifecycleRules: [
        {
          prefix: env.S3_EMAIL_OBJECT_PREFIX,
          transitions: [
            {
              storageClass: s3.StorageClass.INTELLIGENT_TIERING,
              transitionAfter: cdk.Duration.days(1),
            },
          ],
        },
      ],
      autoDeleteObjects: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const ruleSet = ses.ReceiptRuleSet.fromReceiptRuleSetName(
      this,
      "Rules",
      env.SES_RULE_SET_NAME
    );

    new ses.DropSpamReceiptRule(this, "Drop-Spam", {
      ruleSet,
      recipients,
    });

    ruleSet.addRule("Save-To-S3", {
      recipients,
      actions: [
        new sesActions.S3({
          bucket,
          objectKeyPrefix: env.S3_EMAIL_OBJECT_PREFIX,
        }),
      ],
    });

    /**
     * Setup handler for reading emails
     */
    const lambdaS3Reader = new LambdaS3Reader(this, {
      bucket,
      objectKeyPrefix: env.S3_EMAIL_OBJECT_PREFIX,
    });

    bucket.grantRead(lambdaS3Reader.lambda);
    lambdaS3Reader.lambda.addToRolePolicy(
      new cdk.aws_iam.PolicyStatement({
        actions: ["ses:SendEmail"],
        resources: ["*"],
      })
    );
  }
}
