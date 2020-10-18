const { lambda: { log } } = require('alonzo');
const axios = require('axios');

const { AWS_REGION, ENVIRONMENT, DOMAIN } = process.env;

function getUuidTime(uuidStr) {
  const uuidArr = uuidStr.split('-');
  const timeStr = [uuidArr[2].substring(1), uuidArr[1], uuidArr[0]].join('');
  return parseInt(timeStr, 16);
}

function compareUuids(uuidA, uuidB) {
  /*
  * If uuidA is greater, return negative value.
  *   uuidA gets lower index than uuidB, most recent uuid will be 0th element
  */
  return getUuidTime(uuidB) - getUuidTime(uuidA);
}

async function fetchArtifactId({ interactionId, tenantId, auth }) {
  const params = {
    method: 'get',
    url: `https://${AWS_REGION}-${ENVIRONMENT}-edge.${DOMAIN}/v1/tenants/${tenantId}/interactions/${interactionId}/artifacts`,
    headers: {
      Authorization: auth,
    },
  };
  log.debug('Fetching artifacts summary', params);
  const { data: { results } } = await axios(params);
  log.info('Fetch artifacts response', results);
  return results.map((a) => a.artifactId).sort(compareUuids)[0];
}

async function fetchEmailArtifact({ interactionId, tenantId, auth }) {
  const artifactId = await fetchArtifactId({ interactionId, tenantId, auth });
  const params = {
    method: 'get',
    url: `https://${AWS_REGION}-${ENVIRONMENT}-edge.${DOMAIN}/v1/tenants/${tenantId}/interactions/${interactionId}/artifacts/${artifactId}`,
    headers: {
      Authorization: auth,
    },
  };
  log.info('Fetching Email Artifact', params);
  const { data } = await axios(params);
  log.info('Fetch Email Artifact Response', data);
  const htmlFile = data.files.find((f) => f.contentType === 'text/html');
  const plainTextFile = data.files.find((f) => f.contentType === 'text/plain');

  return htmlFile || plainTextFile;
}

async function fetchEmail({ interactionId, tenantId, auth }) {
  const { url, contentType } = await fetchEmailArtifact({ interactionId, tenantId, auth });
  const params = {
    method: 'get',
    url,
    headers: {
      Authorization: auth,
    },
  };
  log.info('Fetching Email File', params);
  const { data: { emailFile } } = await axios(params);
  if (emailFile) {
    return { emailFile, contentType };
  }
  throw new Error('Email Transcript does not exist');
}

exports.handler = async (event) => {
  const {
    params: {
      'tenant-id': tenantId,
      'interaction-id': interactionId,
      'user-id': userId,
      auth,
    },
    headers:
    {
      accept,
    },
  } = event;

  const logContext = {
    tenantId,
    interactionId,
    userId,
    accept,
  };

  log.info('Fetching Email Transcript', logContext);
  // TODO: Use 'accept' header to make pdf/html decision
  try {
    const { emailFile, contentType } = await fetchEmail({
      interactionId,
      tenantId,
      auth,
    });
    log.info('Fetching complete', logContext);
    return { status: 200, body: emailFile, headers: { 'Content-Type': contentType } };
  } catch (error) {
    const errMsg = 'An error occurred fetching email transcript';
    log.error(errMsg, logContext, error);
    return {
      status: 500,
      body: { message: errMsg },
    };
  }
};
