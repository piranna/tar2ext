const fs    = require('fs')
const spawn = require('child_process').spawn

const extract = require('tar-fs').extract
const gunzip  = require('gunzip-maybe')
const tmp     = require('tmp')

const S_IRWXU = fs.constants.S_IRWXU

tmp.setGracefulCleanup()


const options = {stdio: ['ignore', 'ignore', 'inherit']}


/**
 * Create an Ext2 filesystem from a tarfile
 */
function tar2ext(tarfile, dir, uid, gid, out)
{
  tmp.dir({unsafeCleanup: true}, function(err, tmpDir, dirCleanup)
  {
    function onError(error)
    {
      dirCleanup()
      callback(error)
    }

    if(err) return onError(err)


    function result_tune2fs(code, signal)
    {
      if(code) return onError(code)

      // Fix filesystem structures, and raise error if they needed huge changes
      spawn('e2fsck', ['-y', out], options)
      .on('error', onError)
      .on('exit', result_e2fsck)
    }

    function result_e2fsck(code, signal)
    {
      if(code && code > 2) return onError(code)

      // Ext2 filesystem succesfully generated
      dirCleanup()
      callback()
    }


    tmp.file(function(err, tmpFile, fd, fileCleanup)
    {
      if(err) return onError(err)


      let diskSize = 0  // Disk size in KB


      function onEntry(header)
      {
        let type = header.type

        // Entry size
        switch(type)
        {
          case 'directory':
            diskSize += 4
          break;

          case 'file':
            diskSize += Math.floor(header.size / 1024) + 1
          break;
        }

        // Write devtable
        let name = header.name
        if(name.split('/')[0] !== dir) return

        const path = '/'+name
        const mode = (header.mode & S_IRWXU).toString(8)

        switch(type)
        {
          case 'directory':
            fs.writeSync(fd, path+' d '+mode+' '+uid+' '+gid+'\n')
          break;

          case 'file':
            fs.writeSync(fd, path+' f '+mode+' '+uid+' '+gid+'\n')
          break;
        }
      }

      function onFinish()
      {
        let argv =
        [
          '-b', diskSize,
          '--root', tmpDir,
          '--devtable', tmpFile,
          '--block-size', 1024,
          '--bytes-per-inode', 4096,
          '--reserved-percentage', 0,
          '--creator-os', 'linux',
          '--allow-holes',
          '--squash',
          out
        ]

        spawn('genext2fs', argv, options)
        .on('error', function(error)
        {
          fileCleanup()
          onError()
        })
        .on('exit', function(code, signal)
        {
          fileCleanup()

          if(code) return onError(code)

          // Set filesystem features and users files permissions
          let argv = [out, '-O', 'has_journal,filetype']

          spawn('tune2fs', argv, options)
          .on('error', onError)
          .on('exit', result_tune2fs)
        })
      }


      // Extract tarfile, create devtable and calculate filesystem size
      tarfile.pipe(gunzip()).pipe(extract(tmpDir))
      .on('entry', onEntry)
      .on('finish', onFinish)
    })
  })
}


module.exports = tar2ext
