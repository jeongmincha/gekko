var _ = require('lodash');
var util = require('../../core/util.js');
var config = util.getConfig();
var log = require(util.dirs().core + 'log');

var handle = require('./handle');
var postgresUtil = require('./util');

var Reader = function() {
  _.bindAll(this);
  this.db = handle;
}

// returns the furtherst point (up to `from`) in time we have valid data from
Reader.prototype.mostRecentWindow = function(from, to, next) {
  to = to.unix();
  from = from.unix();

  var maxAmount = to - from + 1;

  var query = this.db.query(`
  SELECT start from ${postgresUtil.table('candles')}
  WHERE start <= ${to} AND start >= ${from}
  ORDER BY start DESC
  `);

  var rows = [];
  query.on('row', function(row) {
    rows.push(row);
  });

  // After all data is returned, close connection and return results
  query.on('end', function() {

    // no candles are available
    if(rows.length === 0) {
      return next(false);
    }

    if(rows.length === maxAmount) {

      // full history is available!

      return next({
        from: from,
        to: to
      });
    }

    // we have at least one gap, figure out where
    var mostRecent = _.first(rows).start;

    var gapIndex = _.findIndex(rows, function(r, i) {
      return r.start !== mostRecent - i * 60;
    });

    // if there was no gap in the records, but
    // there were not enough records.
    if(gapIndex === -1) {
      var leastRecent = _.last(rows).start;
      return next({
        from: leastRecent,
        to: mostRecent
      });
    }

    // else return mostRecent and the
    // the minute before the gap
    return next({
      from: rows[ gapIndex - 1 ].start,
      to: mostRecent
    });

  });
}

Reader.prototype.get = function(from, to, what, next) {
  if(what === 'full'){
    what = '*';
  }

  var query = this.db.query(`
  SELECT ${what} from ${postgresUtil.table('candles')}
  WHERE start <= ${to} AND start >= ${from}
  ORDER BY start ASC
  `);

  var rows = [];
  query.on('row', function(row) {
    rows.push(row);
  });

  query.on('end',function(){
    next(null, rows);
  });
}

Reader.prototype.count = function(from, to, next) {
  var query = this.db.query(`
  SELECT COUNT(*) as count from ${postgresUtil.table('candles')}
  WHERE start <= ${to} AND start >= ${from}
  `);
  var rows = [];
  query.on('row', function(row) {
    rows.push(row);
  });

  query.on('end',function(){
    next(null, _.first(rows).count);
  });
}

Reader.prototype.countTotal = function(next) {
  var query = this.db.query(`
  SELECT COUNT(*) as count from ${postgresUtil.table('candles')}
  `);
  var rows = [];
  query.on('row', function(row) {
    rows.push(row);
  });

  query.on('end',function(){
    next(null, _.first(rows).count);
  });
}

Reader.prototype.lastRecord = function(next) {
  // get last record with volume > 0
  var query = this.db.query(`
  SELECT * from ${postgresUtil.table('candles')} WHERE volume > 0 ORDER BY start desc LIMIT 1
  `);
  var rows = [];
  query.on('row', function(row) {
    rows.push(row);
  });

  query.on('end',function(){
    var first = _.first(rows);
    // return first;
    next(first);
  });
}
Reader.prototype.getBoundry = function(next) {
  var query = this.db.query(`
  SELECT (
    SELECT start
    FROM ${postgresUtil.table('candles')}
    ORDER BY start LIMIT 1
  ) as first,
  (
    SELECT start
    FROM ${postgresUtil.table('candles')}
    ORDER BY start DESC
    LIMIT 1
  ) as last
  `);
  var rows = [];
  query.on('row', function(row) {
    rows.push(row);
  });

  query.on('end',function(){
    next(null, _.first(rows));
  });
}

Reader.prototype.close = function() {
  this.db = null;
}

module.exports = Reader;
