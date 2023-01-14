import { S3 } from "@aws-sdk/client-s3";
import { readFileSync } from "fs";
import { handler } from "../lib/reader";
import { GoogleSpreadsheet } from "google-spreadsheet";
import MOCK_CONTEXT from "./fixtures/mock-lambda-context";
import * as MOCK_EVENT from "./fixtures/mock-s3-put-object-event.json";
import path = require("path");

jest.mock("@aws-sdk/client-s3");

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

const MOCK_EMAIL = readFileSync(
  path.join(__dirname, "fixtures", "mock-email.txt"),
  "utf8"
);

describe("Lambda function", () => {
  it("parses the email", async () => {
    expect.hasAssertions();
    const event = Object.assign({}, MOCK_EVENT);

    jest.spyOn(S3.prototype, "getObject").mockImplementationOnce(() => {
      return Promise.resolve({
        Body: MOCK_EMAIL,
      });
    });

    await handler(event, MOCK_CONTEXT, MOCK_CALLBACK);

    expect(mockAddRow).toHaveBeenCalledWith({
      Amount: "1.20",
      Date: "2023-01-10T17:39:18-08:00",
      From: "TODO",
    });
  });
});
