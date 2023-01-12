const context = {
  callbackWaitsForEmptyEventLoop: true,
  logGroupName: "/aws/lambda/my-function",
  logStreamName: "2015/09/22/[HEAD]13370a84ca4ed8b77c427af260",
  functionName: "my-function",
  memoryLimitInMB: "128",
  functionVersion: "HEAD",
  invokeid: "invocation-id",
  awsRequestId: "request-id",
  invokedFunctionArn:
    "arn:aws:lambda:us-east-1:123456789012:function:my-function",
  getRemainingTimeInMillis: () => 1000,
  done: () => {},
  fail: () => {},
  succeed: () => {},
};

export default context;
