const axios = require('axios');

jest.mock('axios');

global.process.env = {
  RANDOM_VAR: 133,
};

const event = { randomParam: 'randomValue' };

axios.mockImplementation(() => ({
  data: {
    name: 'Black Eye Joe (w/ Stone Brewing Co)',
    tagline: 'Coffe Black IPA.',
    description:
      'A fresh tropical hit from this Black IPA, with undertones of roasted coffee. A well balanced, drinkable yet complex beer.',
  },
}));

const { handler } = require('../index');

describe('email-transcripts', () => {
  describe('Everything is successful', () => {
    it('returns when the code runs without any error', async () => {
      const result = await handler(event);
      expect(result).toBeTruthy();
    });

    describe('Walkthrough', () => {
      beforeAll(async () => {
        jest.clearAllMocks();
        await handler(event);
      });

      it('passes in the correct arguments to axios', async () => {
        expect(axios.mock.calls[0][0]).toEqual({
          method: 'get',
          url: 'https://api.punkapi.com/v2/beers/133',
        });
      });
    });
  });
});
