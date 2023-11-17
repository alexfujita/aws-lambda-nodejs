// @flow
import { createConnection } from 'mysql';
import type { Connection, QueryOptions, QueryResults } from 'mysql';
import SqlString from 'sqlstring';

/**
 * asyncQuery - DBにクエリを投げるutility funciton
 */
export function asyncQuery(
  dbCon: Connection,
  query: QueryOptions,
  inserts: Object | Array<any>
): Promise<QueryResults> {
  return new Promise((resolve, reject) => {
    dbCon.query(query, inserts, (err, rows) => {
      if (err) {
        reject(err);
      }
      resolve(rows);
    });
  });
}

/**
 * establishDbConnection - mysqlのコネクション確立をPromiseでwrapしたfunction
 */
export function establishDbConnection(
  host: string,
  user: string,
  password: string,
  database: string,
  options?: Object = {}
): Promise<Connection> {
  options.queryFormat = queryFormat;
  return new Promise((resolve, reject) => {
    const con = createConnection({
      host,
      user,
      password,
      database,
      timezone: 'Asia/Tokyo',
      charset: 'utf8mb4',
      supportBigNumbers: true,
      bigNumberStrings: true,
      ...options
    });
    con.connect(err => {
      if (err) {
        reject(err);
      } else {
        resolve(con);
      }
    });
  });
}

function queryFormat(query, values) {
  if (!values) return query;
  if (Array.isArray(values)) {
    return SqlString.format(
      query,
      values,
      this.config.stringifyObjects,
      this.config.timezone
    );
  }
  return query.replace(
    /\:(\w+)/g,
    function(txt, key) {
      if (
        typeof values.hasOwnProperty == 'function' &&
        values.hasOwnProperty(key)
      ) {
        return this.escape(values[key]);
      }
      return txt;
    }.bind(this)
  );
}

/**
 * closeDbConnection - description
 */
export function closeDbConnection(connection: Connection): Promise<void> {
  return new Promise((resolve, reject) => {
    connection.end(err => {
      if (err) {
        reject(err);
      }
      resolve();
    });
  });
}
