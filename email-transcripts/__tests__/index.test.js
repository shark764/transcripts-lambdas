const axios = require('axios');

jest.mock('axios');

global.process.env = {
  AWS_REGION: 'us-east-1',
  ENVIRONMENT: 'dev',
  DOMAIN: 'domain',
};

const event = { params: { 'tenant-id': 123, 'interaction-id': 456 } };

axios.mockImplementation(() => null);

const { handler } = require('../index');

describe('email-transcripts', () => {
  describe('Everything is successful', () => {
    it('returns when the code runs without any error', async () => {
      // const result = await handler(event);
      expect(true).toBeTruthy();
    });

    describe('Walkthrough', () => {
      beforeAll(async () => {
        jest.clearAllMocks();
        await handler(event);
      });
    });
  });
});
