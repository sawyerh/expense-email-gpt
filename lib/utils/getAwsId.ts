import { getEnv } from "./getEnv";

const env = getEnv();

/**
 * Generate an ID for an AWS resource
 * https://docs.aws.amazon.com/cdk/latest/guide/identifiers.html
 */
export const getAwsId = (id?: string) => {
  // If the ID is "Default", CDK excludes it in the logical ID calculation.
  // This can be handy for shortening the resource name.
  // https://github.com/aws/aws-cdk/blob/e5095b2cbda7422bd6e67aab6ad949294b0b8ef2/packages/%40aws-cdk/core/lib/private/uniqueid.ts#L4-L15
  if (!id) return "Default";

  return `${env.RESOURCE_PREFIX}${id}`;
};
