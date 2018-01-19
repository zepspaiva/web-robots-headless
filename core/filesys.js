var Q = require('q');
var fs = require('fs');
var path = require('path');

var FileSys = function() {
}

FileSys.prototype.fileExists = function(filepath) {
    
    if (!filepath) throw new Error('File path undefined')
        
    var self = this;

    return Q.nfcall(fs.stat, filepath)
    .then(function(stat) {
        return stat.isFile();
    })
    .catch(function(err) {
        if (err.code != 'ENOENT') return false;
    });

}

FileSys.prototype.folderExists = function(folderpath) {

    var self = this;

    return Q.nfcall(fs.stat, folderpath)
    .then(function(stat) {
        return stat.isDirectory();
    })
    .catch(function(err) {
        if (err.code != 'ENOENT') return false;
    });

}

FileSys.prototype.readTxtFile = function(filepath) {

    var self = this;

    return Q.nfcall(fs.readFile, filepath, 'utf8')

};

FileSys.prototype.readJsonFile = function(filepath) {

    var self = this;

    return self.readTxtFile(filepath)
    .then(function(content) {
        return JSON.parse(content);
    })
    .catch(function(err) {
        console.log('Read file error', filepath, err);
        throw err;
    });
    
};

FileSys.prototype.createFolder = function(folderpath) {

    var self = this;

    return self.folderExists(folderpath)
    .then(function(exists) {
        if (!exists) return Q.nfcall(fs.mkdir, folderpath);
    });

};

FileSys.prototype._removeFolderRecursive = function(folderpath) {

    var self = this;

    if(fs.existsSync(folderpath)) {

        fs.readdirSync(folderpath).forEach(function(file,index) {
            
            var curpath = path.join(folderpath, file);

            if(fs.lstatSync(curpath).isDirectory()) {
                self._removeFolderRecursive(curpath);
            } else {
                fs.unlinkSync(curpath);
            }

        });

        fs.rmdirSync(folderpath);

    }

};

FileSys.prototype.removeFolder = function(folderpath) {

    var self = this;

    return self.folderExists(folderpath)
    .then(function(exists) {
        
        if (exists)
            self._removeFolderRecursive(folderpath);

    });

};

FileSys.prototype.writeTxtFile = function(filepath, data) {

    var self = this;

    return Q.nfcall(fs.writeFile, filepath,  data, 'utf8');
    
};

FileSys.prototype.writeJsonFile = function(filepath, data) {

    var self = this;

    return self.writeTxtFile(filepath, JSON.stringify(data));

};

FileSys.prototype.openFileStream = function(filepath) {

    var self = this;

    return Q.fcall(fs.existsSync, filepath)
    .then(function(exists) {
        if (!exists) throw new Error(['File not found.', filepath].join(''));
        return Q.fcall(fs.statSync, filepath);
    })
    .then(function(stat) {
        if (!stat.isFile()) throw new Error(['Not a file.', filepath].join(''));
        return Q.fcall(fs.createReadStream, filepath);
    });

};

FileSys.prototype.openWriteFileStream = function(filepath) {

    var self = this;

    return Q.fcall(fs.createWriteStream, filepath);

};

FileSys.prototype.writeBufferFile = function(filepath, buffer) {

    var self = this;

    return Q.fcall(fs.openSync, filepath, 'w')
    .then(function(fd) {
        fs.writeSync(fd, buffer, 0, buffer.length, 0);
        fs.closeSync(fd);
    });

};

FileSys.prototype.listFiles = function(folderpath, regex) {
    
    var self = this;
    regex = regex || /.*/i;

    return self.folderExists(folderpath)
    .then(function(exists) {
        if (exists)
            return fs.readdirSync(folderpath).filter(function(file) {
                return (fs.statSync(path.join(folderpath, file)).isFile()) && (!regex || regex.test(file));
            });
        else
            return [];
    });

};

FileSys.prototype.moveFile = function(filepath, newfilepath) {
    
    var self = this;

    var newfolderpath = path.dirname(newfilepath);

    if (!fs.existsSync(newfolderpath))
        fs.mkdirSync(newfolderpath);
    
    return Q.nfcall(fs.rename, filepath, newfilepath);
}

FileSys.prototype.copyFile = function(filepath, newfilepath) {
    
    var self = this;

    var newfolderpath = path.dirname(newfilepath);
    
    if (!fs.existsSync(newfolderpath))
        fs.mkdirSync(newfolderpath);
    
    fs.createReadStream(filepath).pipe(fs.createWriteStream(newfilepath));

    return Q.nfcall(fs.writeFile, newfilepath, fs.readFileSync(filepath));
}

FileSys.prototype.removeFile = function(filepath) {
    
    var self = this;
    
    return Q.nfcall(fs.unlink, filepath);

}

module.exports = FileSys;