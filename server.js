#!/usr/bin/env node

const createReadStream = require('fs').createReadStream

const tar2ext = require('.')


const argv = process.argv

if(argv.length < 4)
{
  console.warn('Usage:', argv[1], '<tar> <dir> <uid> <gid> <out>')
  process.exit(1)
}

const tar = argv[2]
const dir = argv[3]
const uid = argv[4]
const gid = argv[5]
const out = argv[6]


tar2ext(createReadStream(tar), dir, uid, gid, out, function(err)
{
  if(err) throw err
})
