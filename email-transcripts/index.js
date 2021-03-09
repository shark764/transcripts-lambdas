const { lambda: { log } } = require('alonzo');
const axios = require('axios');

const { AWS_REGION, ENVIRONMENT, DOMAIN } = process.env;

function emptyObject(obj) {
  return (Object.keys(obj).length === 0 && obj.constructor === Object);
}
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
  const artifacts = results.filter((a) => ((a.artifactType === 'email' || a.artifactType === 'messaging-transcript') && a.fileCount > 0));
  log.debug('Fetch artifacts response', artifacts);
  guard404((!artifacts || !artifacts.length));
  return artifacts;
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
    params.artifactsSummary.map((a) => fetchArtifact({ ...params, artifactId: a.artifactId })),
  );
  log.debug('Fetched Artifacts', { ...params, artifacts: resolvedArtifacts });
  const mostRecentArtifact = resolvedArtifacts.sort(compareUpdated)[0];
  log.debug('Most Recent Artifact', mostRecentArtifact);
  guard404((!mostRecentArtifact || emptyObject(mostRecentArtifact)));
  return mostRecentArtifact;
}

function findFileById({ files }, fileId) {
  return files.find((f) => f.artifactFileId === fileId);
}

async function fetchEmailArtifactFile(artifact) {
  log.debug('Finding Email Artifact File', { ...artifact });
  const manifestFile = findFileById(artifact, artifact.manifestId);
  guard404((emptyObject(manifestFile) || !manifestFile.url));
  const { data } = await axios(manifestFile.url);
  guard404(!data);
  let fileArtifact;
  if (!data.body.html) {
    fileArtifact = findFileById(artifact, data.body.plain.artifactFileId);
  } else {
    fileArtifact = findFileById(artifact, data.body.html.artifactFileId);
  }
  guard404(!fileArtifact);
  let emailData;
  try {
    emailData = await axios.get(fileArtifact.url);
  } catch (err) {
    // Error retrieving html file url - get plain file content
    if (data.body.html) {
      const plainArtifact = findFileById(artifact, data.body.plain.artifactFileId);
      emailData = await axios.get(plainArtifact.url);
    } else {
      // Error if neither plain or html file exists
      guard404(err);
    }
  }
  guard404(!emailData);
  return emailData;
}

function findTranscriptByMetadata({ files }) {
  return files.find((file) => file && file.metadata && file.metadata.transcript
    && file.metadata.transcript === true);
}

async function fetchMessagingArtifactFile(artifact) {
  log.debug('Finding Messaging Artifact File', { ...artifact });
  const transcriptFile = findTranscriptByMetadata(artifact);
  log.debug('The transcript file', { ...transcriptFile });
  guard404(emptyObject(transcriptFile) || !transcriptFile.url);
  const { url } = transcriptFile;
  log.debug('The s3 artifact url: ', { url });
  const { data } = await axios.get(url);
  log.debug('Get the messaging payloads from the transcript file', { data });
  guard404(emptyObject(data));
  const updatedPayload = data.map((item) => {
    const {
      payload: { body },
    } = item;
    const { file } = body;
    if (Object.keys(file).length > 0) {
      const { files = [] } = artifact;
      const artifactFile = files.find((aFile) => aFile.metadata
        && aFile.metadata.messageId === body.id);
      if (artifactFile) {
        file.mediaUrl = artifactFile.url;
      }
    }
    return item;
  });
  log.debug('Update the messaging payloads url with the s3 url', { updatedPayload });
  return { messagingTranscript: updatedPayload, contentType: transcriptFile.contentType };
}

exports.handler = async (event) => {
  const { params, params: { 'tenant-id': tenantId, 'interaction-id': interactionId } } = event;
  let contentType = event.headers.accept;
  const logContext = { tenantId, interactionId, accept: contentType };
  const fnParams = { ...logContext, auth: params.auth };
  log.info('Handling fetch digital channel transcript request', logContext);
  try {
    const artifactsSummary = await fetchArtifactsSummary(fnParams);
    const artifact = await fetchMostRecentArtifact({ ...fnParams, artifactsSummary });
    const { artifactType } = artifact;
    log.debug('Get the artifactType from the artifact.', { artifactType });
    let transcriptData;
    switch (artifactType) {
      case 'email': {
        const { data } = await fetchEmailArtifactFile(artifact);
        transcriptData = data;
        break;
      }
      case 'messaging-transcript': {
        transcriptData = await fetchMessagingArtifactFile(artifact);
        contentType = transcriptData.contentType;
        break;
      }
      default: {
        log.info('The given artifact content type is not support yet', logContext);
        guard404(emptyObject(transcriptData));
        break;
      }
    }
    log.info('Fetching complete', logContext);
    return { status: 200, body: transcriptData, headers: { 'Content-Type': contentType } };
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
