const { lambda: { log } } = require('alonzo');
const axios = require('axios');

const { AWS_REGION, ENVIRONMENT, DOMAIN } = process.env;

function getUuidDate(date) {
  return new Date(date);
}

function compareDates(date1, date2) {
  return getUuidDate(date1) > getUuidDate(date2) ? date1 : date2;
}

async function fetchArtifacts(interactionId, tenantId, auth, artifactId) {
  const params = {
    method: 'get',
    url: `https://${AWS_REGION}-${ENVIRONMENT}-edge.${DOMAIN}/v1/tenants/${tenantId}/interactions/${interactionId}/artifacts/${artifactId}`,
    headers: {
      Authorization: auth,
    },
  };
  log.debug('Fetching Artifacts', params);
  const { data } = await axios(params);
  return data;
}

async function fetchArtifact({ interactionId, tenantId, auth }) {
  const params = {
    method: 'get',
    url: `https://${AWS_REGION}-${ENVIRONMENT}-edge.${DOMAIN}/v1/tenants/${tenantId}/interactions/${interactionId}/artifacts`,
    headers: {
      Authorization: auth,
    },
  };
  log.debug('Fetching artifacts summary', params);
  const { data: { results } } = await axios(params);
  const emailArtifacts = results.filter((a) => (a.artifactType === 'email' && a.fileCount > 0));
  log.debug('Fetch email artifacts response', emailArtifacts);
  const resolvedArtifacts = await Promise.all(
    emailArtifacts.map((a) => fetchArtifacts(
      interactionId,
      tenantId,
      auth,
      a.artifactId,
    )),
  );
  return resolvedArtifacts.map((a) => a.created).sort(compareDates)[0];
}

async function fetchMainArtifactFile(interactionId, tenantId, auth, artifactId, artifactFileId) {
  const params = {
    method: 'get',
    url: `https://${AWS_REGION}-${ENVIRONMENT}-edge.${DOMAIN}/v1/tenants/${tenantId}/interactions/${interactionId}/artifacts/${artifactId}/files/${artifactFileId}`,
    headers: {
      Authorization: auth,
    },
  };
  log.debug('Fetching Main Artifact file', params);
  const { data } = await axios(params);
  return data;
}

async function fetchEmailArtifact({ interactionId, tenantId, auth }) {
  const artifact = await fetchArtifact({ interactionId, tenantId, auth });
  log.debug('Fetch Email Artifact Response', artifact);
  const manifestFile = artifact.files.find((f) => f.contentType.toLowerCase() === 'application/json');
  const { data: { body } } = await axios(manifestFile.url);
  const htmlFileId = body.html.artifactFileId;
  const plainTextFileId = body.plain.artifactFileId;
  const artifactFileId = htmlFileId != null ? htmlFileId : plainTextFileId;
  const file = await fetchMainArtifactFile(interactionId,
    tenantId, auth, artifact.artifactId, artifactFileId);
  return file;
}

async function fetchEmail({ interactionId, tenantId, auth }) {
  const { url, contentType } = await fetchEmailArtifact({ interactionId, tenantId, auth });
  const { data } = await axios.get(url);
  // TODO: Use 'accept' header to make pdf/html decision
  if (!data) throw new Error('Missing');
  return { data, contentType };
}

exports.handler = async (event) => {
  const {
    params: {
      'tenant-id': tenantId,
      'interaction-id': interactionId,
      'user-id': userId,
      auth,
    },
    headers: { accept },
  } = event;

  const logContext = {
    tenantId,
    interactionId,
    userId,
    accept,
  };

  log.info('Handling fetch email transcript request', logContext);

  try {
    const { data, contentType } = await fetchEmail({
      interactionId,
      tenantId,
      auth,
    });
    log.info('Fetching complete', logContext);
    return { status: 200, body: data, headers: { 'Content-Type': contentType } };
  } catch (error) {
    const dne = (error.message === 'Missing');
    const errMsg = dne ? 'Specified interaction transcript does not exist' : 'An unexpected error occurred fetching email transcript';
    const status = dne ? 404 : 500;
    log.error(errMsg, logContext, error);
    return {
      status,
      body: { message: errMsg },
    };
  }
};
