// The canonical model is one definition for both sides (ADR-MOS-18, part 3). The server
// file is pure JavaScript with no Node imports, so the client bundles the same code
// instead of keeping a second copy of the profile.
export { PROFILE, nodesOf, edgesOf, degrees, validateModel } from '../../server/graph/model.mjs'
