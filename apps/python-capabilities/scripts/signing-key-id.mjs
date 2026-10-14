export function resolveArtifactSigningKeyId(configuredKeyId, hasProductionTrustRoot) {
  const keyId = configuredKeyId?.trim();
  if (keyId) return keyId;
  if (hasProductionTrustRoot) {
    throw new Error('MINDLINK_ARTIFACT_SIGNING_KEY_ID is required with a production trust root.');
  }
  return 'mindlink-development-ephemeral';
}
