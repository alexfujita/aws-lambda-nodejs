import type { Connection } from 'mysql';
import {
  establishDbConnection,
  closeDbConnection,
  asyncQuery,
} from './utils/db';

let _dbConnection: Connection | null = null;

export async function handler(
  event: LambdaEvent,
  context: LambdaContext,
  callback: LambdaCallback
) {

  try {
    //   establish db connection
    const { DB_HOST, DB_USER, DB_PASSWORD, DB_DATABASE } = process.env;

    const dbConnection: Connection = await establishDbConnection(
      DB_HOST,
      DB_USER,
      DB_PASSWORD,
      DB_DATABASE
    );

    // finallyで参照するために変数に格納しておく
    _dbConnection = dbConnection;

    const programs = await getPrograms();
    // 登録したキーワードのもののみを抽出
    const records = event.Records.filter((record) => {
      const payload = JSON.parse(
        new Buffer(record.kinesis.data, 'base64').toString('ascii')
      );
      if (typeof programs[payload.user.pid] === 'undefined') {
        return;
      }
      if (
        typeof payload.tweet.post_body !== 'undefined' &&
        payload.tweet.post_body !== null
      ) {
        return isIncKeyWordNExcNgWord(
          payload.tweet.post_body,
          programs[payload.user.pid].keyArr,
          programs[payload.user.pid].ngArr
        );
      }
    });
    // テーブルにデータを追加する時用にデータを加工
    const data = records.map((record) => {
      const payload = JSON.parse(
        new Buffer(record.kinesis.data, 'base64').toString('ascii')
      );
      const knsFilteredTwitterTweet = [
        payload.user.pid,
        payload.tweet.tweet_id,
        payload.user.id,
        payload.tweet.tw_uid,
        payload.tweet.post_body,
        payload.tweet.favorites_count,
        payload.tweet.retweets_count,
        payload.tweet.in_reply_to_user_id,
        payload.tweet.in_reply_to_screen_name,
        payload.tweet.in_reply_to_tweet_id,
        payload.tweet.geo,
        payload.tweet.place,
        payload.tweet.source,
        payload.tweet.tweet_created_at,
        payload.tweet.followed_by,
        payload.tweet.is_retweet,
      ];

      return knsFilteredTwitterTweet;
    });
    if (data.length > 0) {
      await insertFilteredTweets(data);
    }
    console.info(
      `Successfully processed ${event.Records.length} records, and filter passed ${data.length} records.`
    );
    return callback(
      null,
      `Successfully processed ${event.Records.length} records, and filter passed ${data.length} records.`
    );
  } catch (err) {
    console.error(err);
    return callback(err);
  } finally {
    await closeDbConnection(_dbConnection);
    // console.log(result);
  }
}

/**
 * Twitterの内容がキーワードのものと該当するかの情報を取得する
 * @param   {string} txt          Blogのタイトルと本文を含めた文
 * @param   {Array}  keyWordArr   フィルターにかけたいキーワード
 * @param   {Array}  ngWordArr    フィルターにかけたくないワード
 * @returns {bool}   incKeyNExcNg true時はキーワードを含むブログ内容
 */
function isIncKeyWordNExcNgWord(txt, keyWordArr, ngWordArr) {
  // keywordsが含まれているか検査(trueなら含まれている)
  let incKeyNExcNg = false;
  if (keyWordArr.length !== 0) {
    incKeyNExcNg =
      incKeyNExcNg ||
      keyWordArr.reduce(
        (p, c) => txt.toLowerCase().indexOf(c.toLowerCase()) !== -1 || p,
        false
      );
  }
  // ng wordsが含まれていないか検査(trueなら含まれていない)
  if (ngWordArr.length !== 0) {
    incKeyNExcNg =
      incKeyNExcNg &&
      ngWordArr.reduce(
        (p, c) => txt.toLowerCase().indexOf(c.toLowerCase()) === -1 && p,
        true
      );
  }
  return incKeyNExcNg;
}

/**
 * キーワードでフィルターされた内容を保存する
 * @param   {Array} knsFilteredTwitterTweet 保存したい内容
 * @returns {Array} result  テーブル保存の実行結果
 */
async function insertFilteredTweets(knsFilteredTwitterTweet) {
  const query = `
  insert into tweets (
    program_id,
    tweet_id,
    user_id,
    tw_uid,
    post_body,
    favorites_count,
    retweets_count,
    in_reply_to_user_id,
    in_reply_to_screen_name,
    in_reply_to_tweet_id,
    geo,
    place,
    source,
    tweet_created_at,
    followed_by,
    is_retweet
  ) values ?
  on duplicate key update
    retweets_count = values(retweets_count),
    tweet_created_at = values(tweet_created_at);
  `;
  const inserts = [knsFilteredTwitterTweet];
  const result = await asyncQuery(_dbConnection, query, inserts);
  return result;
}

/**
 * DBのProgramsテーブルの情報を取得する
 * @param   {mysql.Connection} dbCon mysqlの接続
 * @returns {Promise}                Programs一覧を取得する
 */
function asyncProgramsQuery(dbCon) {
  return new Promise((resolve, reject) => {
    const query = 'select id, keywords, ng_words from programs;';
    dbCon.query(query, (err, rows) => {
      if (err) {
        reject();
      }
      const programs = {};
      rows.forEach((record) => {
        record.keyArr = [];
        if (record.keywords !== null && record.keywords !== '') {
          record.keyArr = record.keywords.split(',');
        }
        record.ngArr = [];
        if (record.ng_words !== null && record.ng_words !== '') {
          record.ngArr = record.ng_words.split(',');
        }
        programs[record.id] = record;
      });
      resolve(programs);
    });
  });
}

/**
 * DBのProgramsテーブルの情報を取得する
 * @returns {any} programs Programs一覧を取得する
 */
async function getPrograms() {
  const programs = await asyncProgramsQuery(_dbConnection);
  return programs;
}
