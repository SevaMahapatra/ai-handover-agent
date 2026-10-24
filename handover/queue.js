// CONTRACT + STUB: the founder's decision queue ("max 10 items a day, each one tap"). Builder A owns this file.
// export async function postDecisionQueue({ ledger, issueOf, info, now, simulated, onShift })
//   ledger: state/ledger.json · issueOf: { key: {identifier, url} } · info: { key: {id, comments} } from Linear
//   onShift(personId) -> bool · returns [{ type: "slack", what, link }] for posts it created (empty when deduped)
// export async function onQueueReaction(event)   -> handled? (listener calls it for reaction_added before the drafts check)
// export async function onQueueReply(event)      -> handled? (listener calls it for thread replies in #handover)
// Decisions become SOURCES: each tap or reply is written to work_pack/drops/decision-<ts>.json, so the next cycle's
// dispatcher update() records it with a citable ref (D..) and every AI carries on from it.
export const FOUNDER = "sam";
export const MAX_ITEMS = 10;

export async function postDecisionQueue() {
  return [];
}
export async function onQueueReaction() {
  return false;
}
export async function onQueueReply() {
  return false;
}
