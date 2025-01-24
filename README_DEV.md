# Commands

rm agent/data/db.sqlite

pnpm install

rm pnpm-lock.yaml && pnpm install --no-frozen-lockfile

pnpm build

pnpm build && pnpm start --characters="characters/c3poRu.character.json"

pnpm start --characters="characters/c3poRu.character.json"

pnpm start:client

docker logs eliza-tee-1 2>&1 -tf --tail=1000
