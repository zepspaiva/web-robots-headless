const { spawn } = require('child_process');
const Q = require('q');
const colors = require('colors');
const path = require('path');
const fs = require('fs');

const express = require('express');
const session = require('express-session');
const https = require('https');

const WebRobot = require('./core/index.js');
const CDP = require('chrome-remote-interface');

const chromeexecpath = '/Applications/Google\ Chrome\ Canary.app/Contents/MacOS/Google\ Chrome\ Canary';

const sessionsecret = 'random_string_goes_here!!';
const sessionduration = 30 * 60 * 1000;
const sessionactiveduration = 5 * 60 * 1000;
const cookiename = 'session';
const keypempath = './certs/key.pem';
const certpempath = './certs/cert.pem';
const port = 443;
const timeout = ms => new Promise(res => setTimeout(res, ms))

function WebRobotHeadless(tmpdir) {

	this.headlesschromespawn = null;
	this.webrobot = null;
	this.tmpdir = tmpdir;

};

WebRobotHeadless.prototype.runHeadlessChrome = function() {

	const self = this;

	const command = chromeexecpath;
	const params = ["--headless", "--remote-debugging-port=9222", "--disable-gpu"];
	
	self.headlesschromespawn = spawn(command, params);

	self.headlesschromespawn.stdout.on('data', (data) => {
		console.log(colors.gray(['stdout:', data].join(' ')));
	});

	self.headlesschromespawn.stderr.on('data', (data) => {
		console.log(colors.gray(['stderr:', data].join(' ')));
	});

	self.headlesschromespawn.on('close', (code) => {
		console.log(colors.yellow(['chrome exited with code:', code].join(' ')));
	});

};

WebRobotHeadless.prototype.close = function() {

	var self = this;

	if (self.headlesschromespawn)
		self.headlesschromespawn.kill();

	if (self.httpsserver)
		self.httpsserver.close();
	
};


WebRobotHeadless.prototype.runWebRobot = function() {

	const self = this;

	self.app = express();
	self.webrobot = new WebRobot();
	
	self.app.use(function(req, res, next) {
		req.rawBody = '';
		req.setEncoding('utf8');
		req.on('data', function(chunk) {
			req.rawBody += chunk;
		});
		req.on('end', function() {
			next();
		});
	});
	
	self.app.use(session({
		cookieName: cookiename,
		secret: sessionsecret,
		duration: sessionduration,
		activeDuration: sessionactiveduration,
	}));

	self.webrobot.setupRoutes(self.app);

	var options = {
		key: fs.readFileSync(keypempath),
		cert: fs.readFileSync(certpempath)
	};

	self.httpsserver = https.createServer(options, self.app).listen(port);

};

WebRobotHeadless.prototype.init = function() {

	const self = this;

	self.runHeadlessChrome();
	self.runWebRobot();

};

WebRobotHeadless.prototype.runTask = function(task, data) {

	const self = this;

	const startdate = new Date();

	return self.webrobot.createTaskExecution(task, data, self.tmpdir)
	.then(function(taskexecuuid) {

		const nexturl = ['https://localhost/next/', taskexecuuid].join('');
		const tasktmpdir = path.join(self.tmpdir, taskexecuuid);

		if (!fs.existsSync(tasktmpdir)) fs.mkdirSync(tasktmpdir);

		self.webrobot.on(['newpdffile-', taskexecuuid].join(''), function(filebuffer) {
			console.log(colors.green(['<newpdffile>', filebuffer.length].join(' ')));
		});

		self.webrobot.on(['error-', taskexecuuid].join(''), function(errorcode) {
			console.log(colors.red(['<error>', errorcode].join(' ')));
		});

		return Q.nfcall(function(callback) {

			CDP(async (client) => {
    
			    const {Page, Security, Runtime} = client;
			    
			    Security.certificateError(({eventId}) => {
			        Security.handleCertificateError({
			            eventId,
			            action: 'continue'
			        });
			    });

			    try {

			    	// Files will be saved inside web-robot
			        // await client.send('Page.setDownloadBehavior', { behavior : "allow", downloadPath: "/Users/paiva/Documents/Workspace/Zeeh/Git/web-robot-maps/downloads/" });

			        await Page.enable();
			        await Security.enable();
			        
			        await Security.setOverrideCertificateErrors({override: true});
			            
			        await Page.navigate({ url: nexturl });
			        await Page.loadEventFired();

			        var finished = false;
			        var waitRobot = true;
			        var waitRobotRetries = 5;
			        var screencount = 1;

			        self.webrobot.on(['finish-', taskexecuuid].join(''), function(errorcode) {
						const enddate = new Date();
						const timeelapsed = enddate.getTime() - startdate.getTime();
						console.log(colors.yellow(['<elapsed> ',timeelapsed, 'ms'].join('')));
						finished = true;

						self.close();
				        client.close();
				        
				        callback(null, tasktmpdir);

					});

					self.webrobot.on(['newstep-', taskexecuuid].join(''), function(stepname) {
						console.log(colors.green(['<newstep>', stepname].join(' ')));

						var printscreenfilepath = path.join(tasktmpdir, ['screenshot_', screencount++, '.pdf'].join(''));
						console.log(colors.blue(['<screenshot>', printscreenfilepath].join(' ')));

						Page.printToPDF({
							printBackground: true
						})
						.then(function(screenshot) {
        					fs.writeFileSync(printscreenfilepath, Buffer.from(screenshot.data, 'base64'));
						});

					});

			        while (!finished && (waitRobot || waitRobotRetries)) {

			            await Runtime.evaluate({expression: 'waitrobot'}).then((result) => {
			                waitRobot = result.result.value;
			                if (!waitRobot && waitRobot != -1)
			                    waitRobotRetries--;
			                else
			                    waitRobotRetries = 5;
			            })
			            .catch((err) => {
			                console.log(err);
			            });

			            if (!finished) {
			            	await timeout(5000);
			            	await Page.loadEventFired();
			            }

			        }

			    } catch (err) {
			        console.error(err);
			    } finally {
			    	// console.log('Closing...');
			     //    await client.close();
			     //    self.close();
			     //    callback(tasktmpdir);
			    }

			}).on('error', (err) => {
			    callback(err);
			});

		});

	});

};

module.exports = WebRobotHeadless;