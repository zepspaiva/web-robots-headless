var Q = require('q');
var path = require('path');
var fs = require('fs');
var util = require('util');
var request = require('request');
var iconv = require('iconv-lite');
var Stream = require('stream').Transform;
var uuid = require('uuid');
var webshot = require('webshot');
var prompt = require('prompt');
var cheerio = require('cheerio');

var DEBUG = false;

function WebClient(task, jar) {

	this.task = task;
	this.jar = jar;

	this.cache = {};
	this.cacheable = /\.css$|\.js$|\.jpg$|\.png|\.gif$/ 
	
};

var Transform = require('stream').Transform;

var TransformStream = function(options) {
	options = options || {};
	options.objectMode = true;
	Transform.call(this, options);
	this.data = '';
	this.filedata = [];
};

util.inherits(TransformStream, Transform);
 
TransformStream.prototype._transform = function(chunk, encoding, callback) {
	
	this.data += iconv.decode(chunk, 'iso-8859-1');
	this.filedata.push(chunk);
	callback();

};

WebClient.prototype._createPostRequest = function(taskexec, url, jar, postdata, headers, callback) {

	if (DEBUG) console.log('POST', url, postdata);

	var options = {
		url: url,
		method: 'POST',
		headers: {
			'user-agent': 'request'
		},
		jar: jar,
		rejectUnauthorized: false,
		body: postdata
	};

	for (h in headers)
		if (['content-type', 'user-agent'].indexOf(h.toLowerCase()) > -1)
			options.headers[h] = headers[h];

	if (DEBUG) console.log('POST', url, postdata, options.headers);

	var doRequest = function(options, callback) {
		request(options, function(error, response, body) {
			if (error) {
				console.log('POST REQ ERROR', url);
				if (retries-- > 0) {
					console.log('Will retry');
					setTimeout(function() {
						doRequest(options, callback);
					}, 1000);
				} else {
					callback(error);
				}
			// } else {
			// 	console.log('SUCCESS 1');
			// 	callback(null, response);
			}

		})
		.on('response', function(response) {

			console.log('>', url, response.headers['content-type']);

			var ts = new TransformStream();

			response
			.pipe(ts)
			.on('finish', function() {
				ts.end();
				return callback(null, response, Buffer.concat(ts.filedata));
			});
		})
	}

	doRequest(options, function (error, response, body) {
		if (error) {
			console.log('POST REQ ERROR', url);
			taskexec.trigger('error', error.code);
		} else {
			callback(response, body);
		}
	});

};

WebClient.prototype._createGetRequest = function(taskexec, url, jar, headers, callback) {

	if (DEBUG) console.log('GET', url);

	var options = {
		url: url,
		method: 'GET',
		headers: {
     		'User-Agent': 'request'
		},
		jar: jar,
		rejectUnauthorized: false
	};

	if (headers && headers['content-type'])
		options.headers['content-type'] = headers['content-type'];

	if (DEBUG) console.log('GET', url, options.headers);

	var retries = 5;

	var doRequest = function(options, callback) {
		request(options, function(error, response, body) {
			if (error) {
				console.log('GET REQ ERROR', url);
				if (retries-- > 0) {
					console.log('Will retry');
					setTimeout(function() {
						doRequest(options, callback);
					}, 1000);
				} else {
					callback(error);
				}
			// } else {
			// 	console.log('SUCCESS 1', body.length);
			// 	callback(null, response, iconv.decode(body, 'iso-8859-1'));
			}
		})
		.on('response', function(response) {

			console.log('>', url, response.headers['content-type']);

			var ts = new TransformStream();

			response
			.pipe(ts)
			.on('finish', function() {
				ts.end();
				return callback(null, response, Buffer.concat(ts.filedata));
			});
		})
	}

	doRequest(options, function (error, response, body) {
		if (error) {
			console.log('GET REQ ERROR', url);
			taskexec.trigger('error', error.code);
		} else {
			// console.log('SUCCESS 2', body.length);
			callback(response, iconv.decode(body, 'iso-8859-1'));
		}
	});

};

WebClient.prototype._createRequest = function(taskexec, url, jar, method, postdata, headers, callback) {

	var self = this;

	switch (method) {

		case 'POST':
			return self._createPostRequest(taskexec, url, jar, postdata, headers, callback);

		default:
			return self._createGetRequest(taskexec, url, jar, headers, callback);

	}

};

WebClient.prototype.runRequest = function(taskexec, method, req, res, rurl, host) {

	var self = this;
	var baseurl = self.task.baseurl;

	var newurl = [baseurl, rurl].join('');

	var step = taskexec.curStep();

	if (self.cacheable.test(req.url) && req.url in self.cache) {
		// console.log('Using cache', req.url);
		return res.status(200).send(self.cache[req.url]);
	}

	self._createRequest(taskexec, newurl, self.jar, method, req.rawBody, req.headers, function(response, body) {

		// Response status code is not 200...
		if (response.statusCode != 200 && response.statusCode != 302)
			return response.pipe(res);
	
		// Response is a PDF file...
		else if (response.headers['content-type'].indexOf('application/pdf') != -1) {

			if (self.task.pdfurl) {
				taskexec.trigger('newpdffile', body);
				return res.redirect([self.task.pdfurl, '?uuid=', taskexec.uuid].join(''));
			} else if (self.task.tmpdir) {
				
				var contentdisposition = response.headers['content-disposition'];
				var filename = contentdisposition && contentdisposition.indexOf('attachment;filename=') == 0 ? response.headers['content-disposition'].substr('attachment;filename='.length) : 'download.pdf';
				var filepath = path.join(self.task.tmpdir, filename);

				fs.writeFileSync(filepath, body, 'binary');
		    
			} else {
				return response.pipe(res);
			}
			
		}

		// Response is JSON data... 
		else if (response.headers['content-type'].indexOf('javascript') == -1 &&
				 response.headers['content-type'].indexOf('html') == -1) {
			res.setHeader('content-type', response.headers['content-type']);
			// console.log('> Redirecting >', response.headers['content-type'], req.url);
			return res.send(body);
		}
		
		// If it's javscript change code so there are no alerts or confirmations...
		else if (response.headers['content-type'].indexOf('javascript') != -1) {

			var js = body.replace(/confirm\(.*\)/gi, 'true');
			// console.log('> Javascript >', response.headers['content-type'], req.url);
			return res.send(js);
			
		}

		// Ignore page if there's no current step or if the urls don't match..
		if (!step || (step.url && rurl.indexOf(step.url) != 0)) {
			console.error('### TYPE/URL unexpected:', response.headers['content-type'], rurl);
			console.error('### Expected URL:', step.url);
			if (body)
				return res.send(body);
			else
				return response.pipe(ts).on('finish', function () { return res.send(ts.data.toString()); });
		}
		// 	return response.pipe(ts).on('finish', function () { return res.send(ts.data.toString()); });

		if (!body) {
			console.log('No body.... pipeing');
			return response.pipe(res);
		}

		body = body.toString();

		var html = body.replace(/confirm\([^\)]*\)/gi, 'true');

		var goOn = function() {

			// Skip not recognized steps...
			while (step && !step.recognize(html, step.debugLog)) {
				console.log('\x1b[31m%s\x1b[0m', 'Skiping step', step.name);
				step = taskexec.nextStep(html);
				if (step) {
					console.log('Going to next step:', step.name);
					self.curdata = step.preProcess(self.curdata);
				}
			}

			// Ignore page if it's not recognized by any of the next steps...
			if (!step) {
				console.log('No more steps...');
				//return response.pipe(ts).on('finish', function () { return res.send(ts.data.toString()); });
				res.setHeader('content-type', response.headers['content-type']);

				taskexec.trigger('finish');

				return res.send(html);
			}

			taskexec.trigger('newstep', step.name);

			self.task.lastHTML = html;

			try {
				// Inject step code...
				html = step.injectCode(html, taskexec.uuid);
			} catch (err) {
				taskexec.trigger('error', err.toString());
			}

			// Go to next step...

			self.curdata = step.posProcess(self.curdata);

			if (!step.repeatUntilNotRecognized) {
				var nextstep = taskexec.nextStep(html);
				if (nextstep) {
					console.log('Next step is:', nextstep.name);
					self.curdata = nextstep.preProcess(self.curdata);
					console.log('self.curdata sicaq_renda_formal_count_task', self.curdata['sicaq_renda_formal_count_task'])
				}
			}

			console.log('> Injected HTML >', response.headers['content-type'], req.url);

			var lastshot = step.config.lastshot;
			if (lastshot) {

				var shoturl = host ? ['https://', host].join('') : '';
				if (lastshot.prefix) shoturl += lastshot.prefix;
				shoturl += ['lastshot?taskexecuuid=', taskexec.uuid].join('');

				console.log('> SHOT: ', shoturl);

				var tempfilepath = [uuid.v4(), '.pdf'].join('');

				return webshot(shoturl, tempfilepath, {
					siteType:'url',
					defaultWhiteBackground: true,
					phantomConfig: {
						'load-images': 'yes',
						'local-to-remote-url-access': 'yes',
						'ignore-ssl-errors': 'true'
					}
				}, function(err) {

					if (err) console.log(err.stack);

					console.log('Screenshot saved: ', tempfilepath);

					var filebuffer = fs.readFileSync(tempfilepath);
					taskexec.trigger('newpdffile', filebuffer);

					if (lastshot.filename) {

						var filepath = path.join(self.task.tmpdir, lastshot.filename);
						fs.rename(tempfilepath, filepath);

					} else {
						
						fs.unlink(tempfilepath);

					}

					taskexec.trigger('finish');

					if (self.task.pdfurl) {
						console.log('Redirecting client to', self.task.pdfurl);
						return res.redirect([self.task.pdfurl, '?uuid=', taskexec.uuid].join(''));
					} else {
						return res.status(200).send('OK');
					}

				});

			}

			console.log('Sending injected HTML.');

			// Send injected HTML to client;
			res.setHeader('content-type', response.headers['content-type']);
			return res.send(html);

		};

		// STOP DEBUGGER!
		if (step.stopDebugQuery) {

			function pbcopy(data) {
			    var proc = require('child_process').spawn('pbcopy'); 
			    proc.stdin.write(data); proc.stdin.end();
			}

			console.log('---------QUERY DEBUG---------');
			console.log('Commands: exit, html or javascript/jquery query');

			var promptQuery = function() {

				console.log('-----------------------------');

				prompt.get(['command'], function (err, result) {
					if (err) { return console.log(err); }

					var command = result.command;
					
					if (command == 'exit') {
						
						return goOn();

					} else if (command == 'html') {

						console.log(html);
						return promptQuery();

					} else {

						try {

							if (command) {

								var $ = cheerio.load(html);
								var result = eval(["(function(data, $) { var d = JSON.parse(JSON.stringify(data)); data['d'] = d; with(data) { return ", command, " } })"].join(''))(step.data, $);
								console.log('result>', result);
								console.log('command export>', JSON.stringify(command));
								console.log('command copied to clippboard>', command);
								pbcopy(command);

							}

						} catch (err) {
							console.log(err.stack);
						}

						promptQuery();

					}
				});

			};

			promptQuery();

		} else {

			goOn();

		}


	});

};

module.exports = WebClient;