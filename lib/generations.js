const TIERS = ["hot", "soft", "general"];

// Normalise whatever the model returned into one of our three tiers.
export function normaliseTier(tier) {
  return TIERS.includes(tier) ? tier : "general";
}

// Log one generation. Returns the new row id, or null on failure —
// logging must never break the user's generation, so callers ignore throws.
export async function logGeneration(admin, { userId, inputs, signalTier, signalHeadline, output }) {
  const { data, error } = await admin
    .from("generations")
    .insert({
      user_id: userId,
      inputs: inputs ?? {},
      signal_tier: normaliseTier(signalTier),
      signal_headline: signalHeadline ?? null,
      output: output ?? null,
    })
    .select("id")
    .single();
  if (error) throw new Error(`logGeneration failed: ${error.message}`);
  return data?.id ?? null;
}

// Self-reported reply outcome. Scoped to the caller's own row.
export async function setReplied(admin, { id, userId, replied }) {
  const { error } = await admin
    .from("generations")
    .update({ replied })
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw new Error(`setReplied failed: ${error.message}`);
}
