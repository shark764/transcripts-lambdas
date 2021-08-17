const { lambda: { log } } = require('alonzo');
const axios = require('axios');
const { validate } = require('uuid');

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

async function fetchUserById({
  logContext, tenantId, userId, auth,
}) {
  const params = {
    method: 'get',
    url: `https://${AWS_REGION}-${ENVIRONMENT}-edge.${DOMAIN}/v1/tenants/${tenantId}/users/${userId}`,
    headers: {
      Authorization: auth,
    },
  };
  let data;
  try {
    const { data: { result } } = await axios(params);
    log.info('Fetch the user info from the api', { ...logContext, userId, result });
    data = result;
  } catch (err) {
    log.error('Fail to fetch the user from the api.', { ...logContext, params, err });
  }
  return data;
}

// eslint-disable-next-line no-unused-vars
async function fetchAllUsers({ logContext, tenantId, auth }) {
  const params = {
    method: 'get',
    url: `https://${AWS_REGION}-${ENVIRONMENT}-edge.${DOMAIN}/v1/tenants/${tenantId}/users`,
    headers: {
      Authorization: auth,
    },
  };
  let data;
  try {
    const { result } = await axios(params);
    data = result;
  } catch (err) {
    log.error('Fail to fetch the users from the api.', { ...logContext, url: params.url, err });
  }
  return data;
}

function findDigitalChannelTranscript({ files }) {
  return files.find((file) => file && file.metadata && file.metadata.transcript
      && file.metadata.transcript === true);
}

function findSMSTranscript({ files }) {
  return files.find((file) => file && file.filename && file.filename === 'transcript.json');
}

async function fetchMessagingArtifactFile(artifact, type, auth, logContext) {
  let transcriptFile;
  log.debug('Finding Messaging Artifact File', { ...artifact });
  if (type === 'sms') {
    transcriptFile = findSMSTranscript(artifact);
  } else {
    transcriptFile = findDigitalChannelTranscript(artifact);
  }
  log.debug('The transcript file', { ...logContext, transcriptFile });
  guard404(emptyObject(transcriptFile) || !transcriptFile.url);
  const { url } = transcriptFile;
  log.debug('The s3 artifact url: ', { url });
  const { data } = await axios.get(url);
  log.debug('Get the messaging payloads from the transcript file', { data });
  guard404(emptyObject(data));
  let updatedPayload = data;
  if (type !== 'sms') {
    updatedPayload = await Promise.all(data.map(async (item) => {
      let {
        // eslint-disable-next-line prefer-const
        payload: { body, from },
      } = item;
      const { file } = body;
      if (Object.keys(file).length > 0) {
        const { files = [] } = artifact;
        const artifactFile = files.find((aFile) => aFile.metadata
            && aFile.metadata.messageId === body.id);
        if (artifactFile) {
          file.mediaUrl = artifactFile.url;
          file.filename = artifactFile.filename;
        }
      }
      if (validate(from)) {
        const user = await fetchUserById({
          logContext, tenantId: logContext.tenantId, userId: from, auth,
        });
        if (user && user.firstName) {
          from = `${user.firstName} ${user.lastName}`;
        }
      }
      return item;
    }));
  } else {
    updatedPayload = await Promise.all(data.map(async (item) => {
      const { payload } = item;
      log.debug('Get the from', { ...logContext, from: payload.from, isUuid: validate(payload.from) });
      if (validate(payload.from)) {
        const user = await fetchUserById({
          logContext, tenantId: logContext.tenantId, userId: payload.from, auth,
        });
        if (user && user.firstName) {
          payload.from = `${user.firstName} ${user.lastName}`;
        }
      }
      return item;
    }));
  }
  log.debug('Updated the messaging payloads url with the s3 url', { updatedPayload });
  return { messagingTranscript: updatedPayload, contentType: transcriptFile.contentType };
}

exports.handler = async (event) => {
  const { params, params: { 'tenant-id': tenantId, 'interaction-id': interactionId } } = event;
  let contentType = event.headers.accept;
  const logContext = { tenantId, interactionId, accept: contentType };
  const fnParams = { ...logContext, auth: params.auth };
  log.info('Handling fetch digital channel transcript request', logContext);
  let transcriptType = '';
  try {
    const artifactsSummary = await fetchArtifactsSummary(fnParams);
    const artifact = await fetchMostRecentArtifact({ ...fnParams, artifactsSummary });
    const { artifactType, artifactSubType } = artifact;
    log.debug('Get the artifactType from the artifact.', { artifactType });
    transcriptType = artifactType;
    let transcriptData;
    switch (artifactType) {
      case 'email': {
        const { data } = await fetchEmailArtifactFile(artifact);
        transcriptData = data;
        break;
      }
      case 'messaging-transcript': {
        if (artifactSubType) {
          // eslint-disable-next-line max-len
          transcriptData = await fetchMessagingArtifactFile(artifact, artifactSubType, params.auth, logContext);
        } else {
          transcriptData = await fetchMessagingArtifactFile(artifact, 'sms', params.auth, logContext);
        }
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
    const errMsg = dne ? 'Specified interaction transcript does not exist' : `An unexpected error occurred fetching ${transcriptType} transcript`;
    const status = dne ? 404 : 500;
    log.error(errMsg, logContext, error);
    return {
      status,
      body: { message: errMsg },
    };
  }
};
