import { S3 } from "@aws-sdk/client-s3";
import { readFileSync } from "fs";
import { handler } from "../lib/reader";
import MOCK_CONTEXT from "./fixtures/mock-lambda-context";
import * as MOCK_EVENT from "./fixtures/mock-s3-put-object-event.json";
import path = require("path");

jest.mock("@aws-sdk/client-s3");

const MOCK_CALLBACK = () => {};

const MOCK_EMAIL = readFileSync(
  path.join(__dirname, "fixtures", "mock-email.txt"),
  "utf8"
);

describe("Lambda function", () => {
  it("gets the object from S3", async () => {
    expect.hasAssertions();
    const event = Object.assign({}, MOCK_EVENT);
    const spy = jest
      .spyOn(S3.prototype, "getObject")
      .mockImplementationOnce(() => {
        return Promise.resolve({
          Body: MOCK_EMAIL,
        });
      });

    await handler(event, MOCK_CONTEXT, MOCK_CALLBACK);

    expect(spy).toHaveBeenCalledWith({
      Bucket: "example-bucket",
      Key: "test%2Fkey",
    });
  });

  it("parses the email", async () => {
    expect.hasAssertions();
    const event = Object.assign({}, MOCK_EVENT);
    jest.spyOn(S3.prototype, "getObject").mockImplementationOnce(() => {
      return Promise.resolve({
        Body: MOCK_EMAIL,
      });
    });

    await handler(event, MOCK_CONTEXT, (err, result) => {
      expect(err).toBeUndefined();
      // I wouldn't necessarily recommend using inline snapshots for this in a real project,
      // but it's a good way to demonstrate the output of the parsed email.
      expect(result).toMatchInlineSnapshot(`
{
  "html": "<div dir="ltr">This is a <b>test!</b></div>
",
  "subject": "Hello world",
  "text": "This is a *test!*
",
}
`);
    });
  });
});
