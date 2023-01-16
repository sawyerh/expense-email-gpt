import { S3 } from "@aws-sdk/client-s3";
import { SESClient } from "@aws-sdk/client-ses";
import { OpenAIApi } from "openai";
import { readFileSync } from "fs";
import { handler } from "../lib/reader";
import MOCK_CONTEXT from "./fixtures/mock-lambda-context";
import * as MOCK_EVENT from "./fixtures/mock-s3-put-object-event.json";
import path = require("path");

// Remove the below and any calls to jest.mock / jest.spyOn to run the
// test against the real services
/*
import { getEnv } from "../lib/utils/getEnv";
getEnv();
*/

jest.mock("@aws-sdk/client-ses");
const sesSendSpy = jest.spyOn(SESClient.prototype, "send");

jest.mock("@aws-sdk/client-s3");
jest.spyOn(S3.prototype, "getObject").mockImplementation(() => {
  return Promise.resolve({
    Body: readFileSync(
      path.join(__dirname, "fixtures", "mock-email.txt"),
      "utf8"
    ),
  });
});

jest.mock("openai");
jest.spyOn(OpenAIApi.prototype, "createCompletion").mockResolvedValue({
  // @ts-expect-error - just mocking what we need
  data: {
    choices: [
      {
        text: "Amount: $1.20, To: Foo Bar, Details: 2022-01-31",
      },
    ],
  },
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

process.env.SENDING_EMAIL = "sender@example.com";

describe("reader", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("parses the email", async () => {
    expect.hasAssertions();
    const event = Object.assign({}, MOCK_EVENT);

    await handler(event, MOCK_CONTEXT, MOCK_CALLBACK);

    expect(mockAddRow).toHaveBeenCalledWith({
      Amount: "1.20",
      "AI completion": "Amount: $1.20, To: Foo Bar, Details: 2022-01-31",
      Details: "2022-01-31",
      "Email date": "2023-01-10 -08:00",
      "Sent to": "Foo Bar",
    });
    expect(sesSendSpy).toHaveBeenCalledTimes(1);
  });

  it("sends reply with error message if the completion doesn't work", async () => {
    expect.hasAssertions();
    const event = Object.assign({}, MOCK_EVENT);

    jest.spyOn(console, "error").mockImplementationOnce(() => {});
    (OpenAIApi.prototype.createCompletion as jest.Mock).mockResolvedValueOnce({
      data: {
        choices: [
          {
            text: "An amount of $1.20 was spent at Foo Bar",
          },
        ],
      },
    });

    try {
      await handler(event, MOCK_CONTEXT, MOCK_CALLBACK);
    } catch (err) {
      expect(sesSendSpy).toHaveBeenCalledTimes(1);
    }
  });
});
