import { S3 } from "@aws-sdk/client-s3";
import { readFileSync } from "fs";
import { handler } from "../lib/reader";
import MOCK_CONTEXT from "./fixtures/mock-lambda-context";
import * as MOCK_EVENT from "./fixtures/mock-s3-put-object-event.json";
import path = require("path");
import nock from "nock";

// Remove the below and any calls to jest.mock / jest.spyOn to run the
// test against the real services
// import { getEnv } from "../lib/utils/getEnv";
// getEnv();

jest.mock("@aws-sdk/client-s3");
jest.spyOn(S3.prototype, "getObject").mockImplementation(() => {
  return Promise.resolve({
    Body: readFileSync(
      path.join(__dirname, "fixtures", "mock-email.eml"),
      "utf8"
    ),
  });
});

const mockAddRow = jest.fn();
jest.mock("google-spreadsheet", () => {
  return {
    GoogleSpreadsheet: jest.fn().mockImplementation(() => {
      return {
        useServiceAccountAuth: jest.fn(),
        loadInfo: jest.fn(),
        sheetsByTitle: {
          Expenses: {
            addRow: mockAddRow,
          },
        },
      };
    }),
  };
});

const MOCK_CALLBACK = () => {};

function mockSesSendEmail() {
  return nock("https://email.us-east-1.amazonaws.com:443", {
    encodedQueryParams: true,
  })
    .post("/")
    .reply(
      200,
      '<SendEmailResponse xmlns="http://ses.amazonaws.com/doc/2010-12-01/">\n  <SendEmailResult>\n    <MessageId>0100018c51114874-cdddd14f-f64b-4497-b10d-7d9b0a9d1ec6-000000</MessageId>\n  </SendEmailResult>\n  <ResponseMetadata>\n    <RequestId>9874af21-34dd-4375-baab-6fe6fb1903b7</RequestId>\n  </ResponseMetadata>\n</SendEmailResponse>\n',
      ["Content-Type", "text/xml"]
    );
}

describe("reader", () => {
  beforeEach(() => {
    process.env.AWS_ACCESS_KEY_ID = "test";
    process.env.AWS_SECRET_ACCESS_KEY = "test";
    process.env.OPENAI_API_KEY = "test";
    process.env.SENDING_EMAIL = "sender@example.com";
    jest.clearAllMocks();
  });

  it("parses the email", async () => {
    expect.hasAssertions();
    const event = Object.assign({}, MOCK_EVENT);

    // nock.recorder.rec();
    nock("https://api.openai.com:443")
      .post("/v1/chat/completions")
      .reply(
        200,
        [
          "1f8b08000000",
          "000000036c524d6bdb4010bdeb572c438f96d1876d19dd4a4b21045268137ca882584b2379d3fdcaeeca8d63fcdfcb4a8ea484ec6119e6cd7bf37676ce0121c06ac8095407ea2aa179b87d884ec7f6fed7ddddd3f36e97c99dd25b6dbfff78ae6ffe25b0f00cb57fc2cabdb19695129aa3634a0e7065903af4aa711625f1669546eb1e10aa46ee69ad7661ba5c87ae337b15469b38bd320f8a556821277f02420839f7b7f7286b7c819c448bb78c406b698b908f45848051dc67805acbaca3d2c162022b251d4a6f5b769ccf00a7142f2bcaf9d47838e7593c0d8a725e6eef9be36db6f9768b9cfec40771b0f4b5899a9b59bf41faa47b434d27ab7140337ccce71f9a1102928a9eaba9b158e28b4669f1830021404ddb0994ce9b8773210929c0a9027252c057415f95243bdc93df688e7eb6052c861a2a5427dd50f7255eae5723b2679c33d996357538e04994a4611487515240212ff0cec325f82c7ebc4697f1c71a26993d9406a9ed1f0cd6293d4879da63bf01ddbb4f056d94d0ae74ea2f4affc0cd6a35e8c1b474139aa657d02947f98c9565c1d509d8937528ca86c9168d366c5c88e012fc070000ffff0300821969d40f030000",
        ],
        ["Content-Type", "application/json", "Content-Encoding", "gzip"]
      );

    const sesNock = mockSesSendEmail();

    await handler(event, MOCK_CONTEXT, MOCK_CALLBACK);

    expect(mockAddRow).toHaveBeenCalledWith({
      Amount: "$1.54",
      Details: "2023-01-02",
      "Email date": "2023-01-10 -08:00",
      "Sent to": "Amazon Web Services",
    });

    expect(sesNock.isDone()).toBeTruthy();
  });

  it("sends reply with error message if the completion doesn't work", async () => {
    expect.hasAssertions();
    const event = Object.assign({}, MOCK_EVENT);

    jest.spyOn(console, "error").mockImplementationOnce(() => {});
    nock("https://api.openai.com:443").post("/v1/chat/completions").reply(500);
    const sesNock = mockSesSendEmail();

    await handler(event, MOCK_CONTEXT, MOCK_CALLBACK);
    expect(sesNock.isDone()).toBeTruthy();
  });
});
