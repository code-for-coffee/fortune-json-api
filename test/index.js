'use strict'

const deepEqual = require('deep-equal')
const qs = require('querystring')

const tapdance = require('tapdance')
const run = tapdance.run
const comment = tapdance.comment
const ok = tapdance.ok

const httpTest = require('fortune/test/http')
const jsonApi = require('../lib')


const mediaType = 'application/vnd.api+json'
const test = httpTest.bind(null, {
  serializers: [
    [
      jsonApi, {
        prefix: ''
      }
    ]
  ]
})


run(() => {
  comment('get ad hoc index')
  return test('/', null, response => {
    ok(response.status === 200, 'status is correct')
    ok(response.headers['content-type'] === mediaType,
      'content type is correct')
  })
})


run(() => {
  comment('create record')
  return test('/animals', {
    method: 'post',
    headers: { 'Content-Type': mediaType },
    body: {
      data: {
        id: 4,
        type: 'animal',
        attributes: {
          name: 'Rover',
          type: 'Chihuahua',
          birthday: new Date().toJSON(),
          picture: new Buffer('This is a string.').toString('base64'),
          'is-neutered': true,
          nicknames: [ 'Doge', 'The Dog' ],
          'some-date': '2015-01-04T00:00:00.000Z'
        },
        relationships: {
          owner: {
            data: { type: 'users', id: 1 }
          }
        }
      }
    }
  }, response => {
    ok(response.status === 201, 'status is correct')
    ok(response.headers['content-type'] === mediaType,
      'content type is correct')
    ok(~response.headers['location'].indexOf('/animals/4'),
      'location header looks right')
    ok(response.body.data.type === 'animals', 'type is correct')
    ok(response.body.data.attributes['is-neutered'] === true,
      'inflected key value is correct')
    ok(new Buffer(response.body.data.attributes.picture, 'base64')
      .toString() === 'This is a string.', 'buffer is correct')
    ok(Date.now() - new Date(response.body.data.attributes.birthday)
      .getTime() < 60 * 1000, 'date is close enough')
  })
})


run(() => {
  comment('create record with existing ID should fail')
  return test('/users', {
    method: 'post',
    headers: { 'Content-Type': mediaType },
    body: {
      data: {
        id: 1,
        type: 'user'
      }
    }
  }, response => {
    ok(response.status === 409, 'status is correct')
    ok(response.headers['content-type'] === mediaType,
      'content type is correct')
    ok(response.body.errors.length === 1, 'error is correct')
  })
})


run(() => {
  comment('create record with wrong route should fail')
  return test('/users/4', {
    method: 'post',
    headers: { 'Content-Type': mediaType },
    body: {}
  }, response => {
    ok(response.status === 405, 'status is correct')
    ok(response.body.errors.length === 1, 'error exists')
  })
})


run(() => {
  comment('create record with missing payload should fail')
  return test('/users', {
    method: 'post',
    headers: { 'Content-Type': mediaType },
    body: {}
  }, response => {
    ok(response.status === 400, 'status is correct')
    ok(response.headers['content-type'] === mediaType,
      'content type is correct')
    ok(response.body.errors.length === 1, 'error exists')
  })
})


run(() => {
  comment('update record #1')
  return test('/users/2', {
    method: 'patch',
    headers: { 'Content-Type': mediaType },
    body: {
      data: {
        id: 2,
        type: 'users',
        attributes: {
          name: 'Jenny Death',
          'camel-case-field': 'foobar',
          'birthday': '2015-01-07'
        },
        relationships: {
          spouse: {
            data: { type: 'users', id: 3 }
          },
          'owned-pets': {
            data: [
              { type: 'animals', id: 3 }
            ]
          },
          enemies: {
            data: [
              { type: 'users', id: 3 }
            ]
          },
          friends: {
            data: [
              { type: 'users', id: 1 },
              { type: 'users', id: 3 }
            ]
          }
        }
      }
    }
  }, response => {
    ok(response.status === 200, 'status is correct')
    ok(Math.abs(new Date(response.body.data.attributes['last-modified-at'])
      .getTime() - Date.now()) < 5 * 1000, 'update modifier is correct')
    ok(response.body.data.attributes['birthday'] ===
       '2015-01-07T00:00:00.000Z', 'inflected casted value is correct')
  })
})


run(() => {
  comment('update record #2')
  return test('/animals/1', {
    method: 'patch',
    headers: { 'Content-Type': mediaType },
    body: {
      data: {
        id: 1,
        type: 'animals',
        attributes: {
          nicknames: [ 'Foo', 'Bar' ]
        }
      }
    }
  }, response => {
    ok(response.status === 200, 'status is correct')
    ok(Math.abs(new Date(response.body.data.attributes['last-modified-at'])
      .getTime() - Date.now()) < 5 * 1000, 'update modifier is correct')
  })
})


run(() => {
  comment('sort a collection and use sparse fields')
  return test(
  `/users?${qs.stringify({
    'sort': 'birthday,-name',
    'fields[user]': 'name,birthday'
  })}`, null, response => {
    ok(response.status === 200, 'status is correct')
    ok(~response.body.links.self.indexOf('/users'), 'link is correct')
    ok(deepEqual(
      response.body.data.map(record => record.attributes.name),
      [ 'John Doe', 'Microsoft Bob', 'Jane Doe' ]),
      'sort order is correct')
  })
})


run(() => {
  comment('use limit option')
  return test(
  `/users?${qs.stringify({
    'page[limit]': 1
  })}`, null, response => {
    ok(response.status === 200, 'status is correct')
    ok('first' in response.body.links, 'pagination first included')
    ok('last' in response.body.links, 'pagination last included')
    ok('next' in response.body.links, 'pagination next included')

    for (const key in response.body.links) {
      if (key === 'self') continue
      ok(Object.keys(qs.parse(
        response.body.links[key].split('?')[1])).length === 2,
        'number of query options correct')
    }

    ok(response.body.data.length === 1, 'limit option applied')
  })
})


run(() => {
  comment('filter a collection')
  return test(`/users?${qs.stringify({
    'filter[name]': 'John Doe,Jane Doe',
    'filter[birthday]': '1992-12-07'
  })}`, null, response => {
    ok(response.status === 200, 'status is correct')
    ok(~response.body.links.self.indexOf('/users'), 'link is correct')
    ok(deepEqual(
      response.body.data.map(record => record.attributes.name).sort(),
      [ 'John Doe' ]), 'match is correct')
  })
})


run(() => {
  comment('dasherizes the camel cased fields')
  return test('/users/1', null, response => {
    ok('created-at' in response.body.data.attributes,
      'camel case field is correct')
  })
})


run(() => {
  comment('find a single record with include')
  return test(
    `/animals/1?${qs.stringify({ include: 'owner.friends' })}`,
  null, response => {
    ok(response.status === 200, 'status is correct')
    ok(~response.body.links.self.indexOf('/animals/1'), 'link is correct')
    ok(response.body.data.id === '1', 'id is correct')
    ok(deepEqual(response.body.included.map(record => record.type),
      [ 'users', 'users' ]), 'type is correct')
    ok(deepEqual(response.body.included.map(record => record.id)
      .sort((a, b) => a - b), [ '1', '3' ]), 'id is correct')
  })
})


run(() => {
  comment('show individual record with encoded ID')
  return test('/animals/%2Fwtf', null, response => {
    ok(response.status === 200, 'status is correct')
    ok(~response.body.links.self.indexOf('/animals/%2Fwtf'), 'link is correct')
    ok(response.body.data.id === '/wtf', 'id is correct')
  })
})


run(() => {
  comment('find a single non-existent record')
  return test('/animals/404', null, response => {
    ok(response.status === 404, 'status is correct')
    ok('errors' in response.body, 'errors object exists')
    ok(response.body.errors[0].title === 'NotFoundError', 'title is correct')
    ok(response.body.errors[0].detail.length, 'detail exists')
  })
})


run(() => {
  comment('delete a single record')
  return test('/animals/2', { method: 'delete' }, response => {
    ok(response.status === 204, 'status is correct')
  })
})


run(() => {
  comment('find a singular related record')
  return test('/users/2/spouse', null, response => {
    ok(response.status === 200, 'status is correct')
    ok(~response.body.links.self.indexOf('/users/2/spouse'), 'link is correct')
    ok(!Array.isArray(response.body.data), 'data type is correct')
  })
})


run(() => {
  comment('find a plural related record')
  return test('/users/2/owned-pets', null, response => {
    ok(response.status === 200, 'status is correct')
    ok(~response.body.links.self.indexOf('/users/2/owned-pets'),
      'link is correct')
    ok(response.body.data.length === 2, 'data length is correct')
  })
})


run(() => {
  comment('find a collection of non-existent related records')
  return test('/users/3/owned-pets', null, response => {
    ok(response.status === 200, 'status is correct')
    ok(~response.body.links.self.indexOf('/users/3/owned-pets'),
      'link is correct')
    ok(Array.isArray(response.body.data) && !response.body.data.length,
      'data is empty array')
  })
})


run(() => {
  comment('find an empty collection')
  return test(encodeURI('/☯s'), null, response => {
    ok(response.status === 200, 'status is correct')
    ok(~response.body.links.self.indexOf(
      encodeURI('/☯s')), 'link is correct')
    ok(Array.isArray(response.body.data) && !response.body.data.length,
      'data is empty array')
  })
})


run(() => {
  comment('get an array relationship entity')
  return test('/users/2/relationships/owned-pets', null, response => {
    ok(response.status === 200, 'status is correct')
    ok(~response.body.links.self.indexOf('/users/2/relationships/owned-pets'),
      'link is correct')
    ok(deepEqual(response.body.data.map(data => data.id), [ 2, 3 ]),
      'ids are correct')
  })
})


run(() => {
  comment('get an empty array relationship entity')
  return test('/users/3/relationships/owned-pets', null, response => {
    ok(response.status === 200, 'status is correct')
    ok(~response.body.links.self.indexOf('/users/3/relationships/owned-pets'),
      'link is correct')
    ok(deepEqual(response.body.data, []), 'data is correct')
  })
})


run(() => {
  comment('get a singular relationship entity')
  return test('/users/1/relationships/spouse', null, response => {
    ok(response.status === 200, 'status is correct')
    ok(~response.body.links.self.indexOf('/users/1/relationships/spouse'),
      'link is correct')
    ok(response.body.data.type === 'users', 'type is correct')
    ok(response.body.data.id === 2, 'id is correct')
  })
})


run(() => {
  comment('get an empty singular relationship entity')
  return test('/users/3/relationships/spouse', null, response => {
    ok(response.status === 200, 'status is correct')
    ok(~response.body.links.self.indexOf('/users/3/relationships/spouse'),
      'link is correct')
    ok(response.body.data === null, 'data is correct')
  })
})


run(() => {
  comment('update a singular relationship entity')
  return test('/users/2/relationships/spouse', {
    method: 'patch',
    headers: { 'Content-Type': mediaType },
    body: {
      data: { type: 'users', id: 3 }
    }
  }, response => {
    ok(response.status === 204, 'status is correct')
  })
})


run(() => {
  comment('update an array relationship entity')
  return test('/users/1/relationships/owned-pets', {
    method: 'patch',
    headers: { 'Content-Type': mediaType },
    body: {
      data: [ { type: 'animals', id: 2 } ]
    }
  }, response => {
    ok(response.status === 204, 'status is correct')
  })
})


run(() => {
  comment('post to an array relationship entity')
  return test('/users/1/relationships/owned-pets', {
    method: 'post',
    headers: { 'Content-Type': mediaType },
    body: {
      data: [ { type: 'animals', id: 2 } ]
    }
  }, response => {
    ok(response.status === 204, 'status is correct')
  })
})


run(() => {
  comment('delete from an array relationship entity')
  return test('/users/1/relationships/friends', {
    method: 'delete',
    headers: { 'Content-Type': mediaType },
    body: {
      data: [ { type: 'users', id: 3 } ]
    }
  }, response => {
    ok(response.status === 204, 'status is correct')
  })
})


run(() => {
  comment('respond to options: index')
  return test('/', { method: 'options' }, response => {
    ok(response.status === 204, 'status is correct')
    ok(response.headers['allow'] ===
      'GET', 'allow header is correct')
  })
})


run(() => {
  comment('respond to options: collection')
  return test('/animals', { method: 'options' }, response => {
    ok(response.status === 204, 'status is correct')
    ok(response.headers['allow'] ===
      'GET, POST', 'allow header is correct')
  })
})


run(() => {
  comment('respond to options: individual')
  return test('/animals/1', { method: 'options' }, response => {
    ok(response.status === 204, 'status is correct')
    ok(response.headers['allow'] ===
      'GET, PATCH, DELETE', 'allow header is correct')
  })
})


run(() => {
  comment('respond to options: link')
  return test('/animals/1/owner', { method: 'options' }, response => {
    ok(response.status === 204, 'status is correct')
    ok(response.headers['allow'] ===
      'GET', 'allow header is correct')
  })
})


run(() => {
  comment('respond to options: relationships')
  return test('/animals/1/relationships/owner', { method: 'options' },
  response => {
    ok(response.status === 204, 'status is correct')
    ok(response.headers['allow'] ===
      'GET, POST, PATCH, DELETE', 'allow header is correct')
  })
})


run(() => {
  comment('respond to options: fail')
  return test('/foo', { method: 'options' }, response => {
    ok(response.status === 404, 'status is correct')
  })
})
