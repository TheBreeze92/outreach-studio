export const FREE_LIMIT = 3;

export async function getBalance(admin, userId) {
  const { data, error } = await admin.rpc("get_or_create_credits", { uid: userId });
  if (error) throw new Error(`getBalance failed: ${error.message}`);
  const row = Array.isArray(data) ? data[0] : data;
  const freeUsed = row?.free_used ?? 0;
  const paidCredits = row?.paid_credits ?? 0;
  return {
    free_remaining: Math.max(0, FREE_LIMIT - freeUsed),
    paid_credits: paidCredits,
  };
}

export async function consumeCredit(admin, userId) {
  const { data, error } = await admin.rpc("consume_credit", { uid: userId });
  if (error) throw new Error(`consumeCredit failed: ${error.message}`);
  return data === true;
}

export async function addCredits(admin, userId, amount) {
  const { error } = await admin.rpc("add_credits", { uid: userId, amount });
  if (error) throw new Error(`addCredits failed: ${error.message}`);
}
