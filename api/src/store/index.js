// Tiny key-value store. In Lambda we point it at DynamoDB (TABLE_NAME set);
// locally it's a Map so `npm run dev` needs zero setup.

let impl;

function memoryStore() {
  const m = new Map();
  return {
    kind: 'memory',
    async get(key) {
      const v = m.get(key);
      return v ? structuredClone(v) : null;
    },
    async put(key, value) {
      m.set(key, structuredClone(value));
    },
    async del(key) {
      m.delete(key);
    },
  };
}

async function dynamoStore(table) {
  const { DynamoDBClient } = await import('@aws-sdk/client-dynamodb');
  const { DynamoDBDocumentClient, GetCommand, PutCommand, DeleteCommand } = await import('@aws-sdk/lib-dynamodb');
  const doc = DynamoDBDocumentClient.from(new DynamoDBClient({}), { marshallOptions: { removeUndefinedValues: true } });
  const ttl = () => Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30; // demo data expires after 30 days
  return {
    kind: 'dynamodb',
    async get(key) {
      const r = await doc.send(new GetCommand({ TableName: table, Key: { pk: key } }));
      return r.Item ? r.Item.data : null;
    },
    async put(key, value) {
      await doc.send(new PutCommand({ TableName: table, Item: { pk: key, data: value, expiresAt: ttl(), updatedAt: new Date().toISOString() } }));
    },
    async del(key) {
      await doc.send(new DeleteCommand({ TableName: table, Key: { pk: key } }));
    },
  };
}

export async function getStore() {
  if (impl) return impl;
  impl = process.env.TABLE_NAME ? await dynamoStore(process.env.TABLE_NAME) : memoryStore();
  return impl;
}
