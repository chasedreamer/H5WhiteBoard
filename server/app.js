/*****************************************************************************/
// Database 

var Sequelize = require('sequelize');
var db = new Sequelize('htmlwhiteboard', 'root', '123456',
{
  host: 'localhost',
  dialect: 'mysql',

}

);

var db_board = db.define('board', {
	id: 		{type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
	wbId: 		{type: Sequelize.STRING, allowNull: false},
	objId: 		{type: Sequelize.STRING, allowNull: false},
	usrId: 		{type: Sequelize.INTEGER, allowNull: false},
	obj: 		{type: Sequelize.TEXT, allowNull: false},
	index: 		{type: Sequelize.INTEGER, allowNull: false},
});

var db_image = db.define('image', {
	id: 		{type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
	mimetype: 	{type: Sequelize.STRING, allowNull: false},
	data: 		{type: 'LONGTEXT', allowNull: false},
});

db.sync();


/*****************************************************************************/
// Socket Server

var boards = {};
var queue = [];
var _lock;
unlock();

var io = require('socket.io').listen(8080);

console.log("aaafff");
//io.enable('browser client minification');  // send minified client
//io.enable('browser client etag');          // apply etag caching logic based on version number
//io.enable('browser client gzip');          // gzip the file
io.set('log level', 1);                    // reduce logging
io.set('transports', [                     // enable all transports (optional if you want flashsocket)
   'polling'
  , 'websocket'
  , 'flashsocket'
  , 'htmlfile'
  , 'xhr-polling'
  , 'jsonp-polling'
]);

/*io.set('transports', [                     // enable all transports (optional if you want flashsocket)
    'websocket'
  , 'flashsocket'
  , 'htmlfile'
  , 'xhr-polling'
  , 'jsonp-polling'
]);
*/
io.sockets.on('connection', function(socket) {
  	
        console.log("some one is connected socket.wb_id=%s socket.usr_id=%d", socket.wb_id,socket.usr_id);
	socket.on('message', function(data){ 
		queue.push({socket:socket, data:data});	
                socket.broadcast.to(socket.wb_id).send(JSON.stringify({
                        type: 'CONNECT',
                        slot: socket.usr_id
                }));
	});
  	
	socket.on('disconnect', function(){ 					
		socket.broadcast.to(socket.wb_id).send(JSON.stringify({
			type: 'DISCONNECT',
			slot: socket.usr_id	
		}));
		
               	db_board.findAll({
			where: {
				wbId: socket.wb_id,
				usrId: socket.usr_id
			}
		}).then(
                 function(objects) {
			for( var i in objects ) {
				var obj = JSON.parse(objects[i].obj);
				
				if( obj['selected'] == true ) {
					obj['selected'] = false;
					
					objects[i].updateAttributes({
						obj: JSON.stringify(obj)
					});
				}
			}
		});
		
		if( boards.hasOwnProperty(socket.wb_id) ) {
			for( var i in boards[socket.wb_id] ) {
				if( socket == boards[socket.wb_id][i] ) {
					boards[socket.wb_id].splice(i,1);
					break;
				}
			}
			
			if( boards[socket.wb_id].length == 0 ) {
				delete boards[socket.wb_id];
			}
		}
	});				
});

/*****************************************************************************/


function lock() {
	clearInterval(_lock);
}

/*****************************************************************************/


function unlock() {
	_lock = setInterval( function() {
		if( queue.length > 0 ) {
			var o = queue.shift();
			process(o.socket, o.data);
		}
	}, 1);
}

/*****************************************************************************/


function process(socket, data) {		
	var msg = JSON.parse(data);

	switch( msg['type'] ) {
	
		/*****************************************************************/
		case 'JOIN':
                        console.log("in process JOIN branch");
			var init = !socket.hasOwnProperty('usr_id');
			var wb_id = msg['msg']; 
                        console.log("in process JOIN branch "+wb_id);
			socket.wb_id = wb_id;
		
			socket.join(socket.wb_id);
		
			var ids = [];
			if( boards.hasOwnProperty(wb_id) ) {
				for( var i in boards[wb_id] ) {
					ids.push(boards[wb_id][i].usr_id);
				
					socket.send(JSON.stringify({
						type: 'JOIN', 
						name: boards[wb_id][i].usr_name, 
						slot: boards[wb_id][i].usr_id
					}));
				}
			
				boards[wb_id].push(socket);
			}
			else {
				boards[wb_id] = [socket];
			}
		
			ids.sort();				
			socket.usr_id = 0;
		
			for( var i in ids ) {
				if( ids[i] == socket.usr_id ) {
					socket.usr_id += 1;
				}
				else {
					break;
				}
			}
		
			socket.usr_name = 'Guest-' + socket.usr_id;
		
			socket.send(JSON.stringify({
				type: 'JOINED',
				slot: socket.usr_id
			}));
		
			db_board.findAll({
				where: {
					wbId: socket.wb_id
				}
                          ,order:[[Sequelize.literal(" `index` DESC")]]
                          //  ,'order': "index"
			}).then(
                            function(objects) 
                           {					
				for( var i in objects ) {
					socket.send(JSON.stringify({
						type: 'JCREATE',
						obj: objects[i]['obj'],
						slot: socket.usr_id
					}));
				}
			   }
                        );
		
			if( init == true ) {
                        console.log("init = true  in process JOIN branch");
				socket.broadcast.to(socket.wb_id).send(JSON.stringify({
					type: 'JOIN', 
					name: socket.usr_name, 
					slot: socket.usr_id
				}));
			}
		
			break;
		
		/*****************************************************************/
		case 'REMOVE':
		case 'UCREATE':	
			lock();
		
			var obj = JSON.parse(msg['obj']);
		
			db_board.findAll({
				where: {
					wbId: socket.wb_id,
					objId: obj['id']
				}
			}).then(function(objects) {
				for( var i in objects ) {						
					objects[i].destroy();						
				}
				unlock();
			});
		
			msg['slot'] = socket.usr_id;
			socket.broadcast.to(socket.wb_id).send(JSON.stringify(msg));
		
			break;

		/*****************************************************************/
		case 'CLEAR':
			lock();
			
			db_board.findAll({
				where: {
					wbId: socket.wb_id
				}
			}).then( function(objects) {
				for( var i in objects ) {
					objects[i].destroy();
				}
				unlock();
			});

			msg['slot'] = socket.usr_id;
			socket.broadcast.to(socket.wb_id).send(JSON.stringify(msg));
		
			break;
		
		/*****************************************************************/
		case 'IDENTIFY':
			socket.usr_name = msg['msg'];
			delete msg['msg'];
		case 'CHAT':
			msg['name'] = socket.usr_name;
			msg['slot'] = socket.usr_id;
			socket.broadcast.to(socket.wb_id).send(JSON.stringify(msg));
			break;
		
		/*****************************************************************/
		default:	
			lock();
			
			var json = msg['obj'];
			var obj = JSON.parse(json);
		
			db_board.findAll({
				where: {
					wbId: socket.wb_id,
					objId: obj['id'],
				}
			}).then( function(objects) {					
				if( objects.length > 0 ) {
					for( var i in objects ) {	
						objects[i].updateAttributes({
							usrId: socket.usr_id,
							obj: json,
							index: obj['index']
						}).then( function() {
							unlock();
						});							
					}
				}
				else {
					object = db_board.build({
						wbId: socket.wb_id,
						objId: obj['id'],
						usrId: socket.usr_id,
						obj: json,
						index: obj['index']
					});
			
					object.save().then( function() {
						unlock();
					});
				}
			});
		
			msg['slot'] = socket.usr_id;
			socket.broadcast.to(socket.wb_id).send(JSON.stringify(msg));
	}
}
