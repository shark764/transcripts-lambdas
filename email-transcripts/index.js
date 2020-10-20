const { lambda: { log } } = require('alonzo');
const axios = require('axios');

const { AWS_REGION, ENVIRONMENT, DOMAIN } = process.env;

function guard404(predicate) {
  if (predicate) throw new Error('Missing');
}

function getDate(date) {
  return new Date(date);
}

function compareUpdated(a1, a2) {
  return getDate(a1.updated) > getDate(a2.updated) ? -1 : 1;
}

async function fetchArtifactsSummary({ interactionId, tenantId, auth }) {
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
  guard404((!emailArtifacts || !emailArtifacts.length));
  return emailArtifacts;
}

async function fetchArtifact({
  interactionId,
  tenantId,
  auth,
  artifactId,
}) {
  const params = {
    method: 'get',
    url: `https://${AWS_REGION}-${ENVIRONMENT}-edge.${DOMAIN}/v1/tenants/${tenantId}/interactions/${interactionId}/artifacts/${artifactId}`,
    headers: {
      Authorization: auth,
    },
  };
  log.debug('Fetching Artifact', params);
  const { data } = await axios(params);
  log.debug('Fetch Artifact response', { ...params, data });
  // Don't guard the 404 here
  return data;
}

async function fetchMostRecentArtifact(params) {
  const resolvedArtifacts = await Promise.all(
    params.emailArtifactsSummary.map((a) => fetchArtifact({ ...params, artifactId: a.artifactId })),
  );
  log.debug('Fetched Artifacts', { ...params, artifacts: resolvedArtifacts });
  const mostRecentArtifact = resolvedArtifacts.sort(compareUpdated)[0];
  log.debug('Most Recent Artifact', mostRecentArtifact);
  guard404((!mostRecentArtifact || !mostRecentArtifact.length));
  return mostRecentArtifact;
}

function findManifest({ files }) {
  return files.find((f) => f.contentType.toLowerCase().includes('application/json'));
}

function findFileById({ files }, fileId) {
  return files.find((f) => f.artifactId === fileId);
}

async function fetchEmailArtifactFile(artifact) {
  const manifestFile = findManifest(artifact);
  const { data, data: { body, body: { html, plain } } } = await axios(manifestFile.url);
  guard404((!body.length || !data.length || (!html && !plain)));
  const htmlFileId = html ? html.artifactFileId : null;
  const fileId = htmlFileId || plain.artifactFileId;
  const fileArtifact = findFileById(artifact, fileId);
  guard404(!fileArtifact);
  return fileArtifact;
}

async function fetchEmail(url) {
  const { data } = await axios.get(url);
  // TODO: Use 'accept' header to make pdf/html decision
  guard404(!data);
  return data;
}

exports.handler = async (event) => {
  const { params, params: { 'tenant-id': tenantId, 'interaction-id': interactionId } } = event;
  const contentType = event.headers.accept;
  const logContext = { tenantId, interactionId, accept: contentType };
  const fnParams = { ...logContext, auth: params.auth };
  log.info('Handling fetch email transcript request', logContext);
  try {
    const emailArtifactsSummary = await fetchArtifactsSummary(fnParams);
    const artifact = await fetchMostRecentArtifact({ ...fnParams, emailArtifactsSummary });
    const { url } = await fetchEmailArtifactFile(artifact);
    const data = await fetchEmail(url);
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
