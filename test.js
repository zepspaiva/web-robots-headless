const Q = require('q');
const fs = require('fs');
const path = require('path');

const WebRobotHeadless = require('./index.js');

// const taskfilename = 'sicaq_cadastrar_cliente.task.json';
// const datafilename = 'sicaq_multiplas_rendas.json';

const taskfilename = 'itau_cadastrar_cliente.task.json';
const datafilename = 'itau.json';

const tmpdir = 'tmp';
const task = JSON.parse(fs.readFileSync(path.join('../web-robot-maps/mapping/tasks/', taskfilename)));
const data = JSON.parse(fs.readFileSync(path.join('../web-robot-maps/mapping/test_data/', datafilename)));

var wbh = new WebRobotHeadless(tmpdir);

wbh.init();

return wbh.runTask(task, data)
.then(function(resultfolder) {
	console.log('Task finished', resultfolder);
})
.catch(function(err) {
	console.log('Task err:', err);
});