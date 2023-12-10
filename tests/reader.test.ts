import { S3 } from "@aws-sdk/client-s3";
import { readFileSync } from "fs";
import { handler } from "../lib/reader";
import MOCK_CONTEXT from "./fixtures/mock-lambda-context";
import * as MOCK_EVENT from "./fixtures/mock-s3-put-object-event.json";
import path = require("path");
import nock from "nock";

/**
 * To run the test against the real services:
 * 1. Uncomment getEnv()
 * 2. Comment out the process.env.* assignments in mockEnvVars(), except SENDING_EMAIL
 * 3. Comment out nock() calls or use nock.recorder.rec() to record the real calls
 */
// import { getEnv } from "../lib/utils/getEnv";
// getEnv();

function mockEnvVars() {
  process.env.AWS_ACCESS_KEY_ID = "test";
  process.env.AWS_SECRET_ACCESS_KEY = "test";
  process.env.OPENAI_API_KEY = "test";
  process.env.SENDING_EMAIL = "sender@example.com";
}

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
    mockEnvVars();
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
          "000000036c52db8adb30107df75788611fe3e04b73c16fcb922da5382d644b03f5621479e2a89125238dcb6e43febdd8cedadea57a10c39c39678e4673f118035940c2409c3889aa56fefa47485ff7dfcaeddfcdea93d897364a1f9eca74b36ad6f75b98b50c73f88d82de587361aa5a2149a37b5858e484ad6ab80aa270b95a07510754a640d5d2ca9afc78bef0a9b107e307cb30be314f460a7490b05f1e638c5dbabbf5a80b7c818405b3b74c85cef11221198a18036b549b01ee9c74c435c16c0485d184bab5ad1ba5260019a372c1951a1bf7e73289c74171a5f2223e7f6e76a1d35f766e9f9ee97bba15121f9f26fd7ae9d7ba33746cb4180634c1877cf2a11963a079d5716b6e1de6f852a376f8418031e0b66c2ad4d49a874ba619cb804c0609cbe0fe21ddb09f78603bb47fdac96630eb2b78651a4d7dd55d18c7ab79100ce0412a257599179cb02f898228f683d00fa20c327d857726aedeffe2e75b741dbeec28b574a7dc2277dd8bc191a97ba996f6dcad40f3ee57a1b6a6aa29277346ddbe70b9087b3d18b76e44e3c50d24435c4d58eba5777302eed51156f951ea126d6de5b011ded5fb070000ffff0300beb6438f10030000",
        ],
        ["Content-Type", "application/json", "Content-Encoding", "gzip"]
      );

    const sesNock = mockSesSendEmail();

    await handler(event, MOCK_CONTEXT, MOCK_CALLBACK);

    expect(mockAddRow).toHaveBeenCalledWith({
      Amount: "$1337.00",
      Details: "2023-01-02",
      "Email date": "2023-01-10 -08:00",
      "Sent to": "ACME Web Services",
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
