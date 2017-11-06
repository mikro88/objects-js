const assert = require('assert')
const Obj = require('../')

var TestDep = Obj.make({
	name: 'TestDep',

	props: {
		x: 1
	},

	injected: ['a', 'rand', 'lol']
})

var Test = Obj.make({
	name: 'Test',

	props: {
		a: undefined,
		b: 10,
		k () {
			return Math.random()
		},
		d () {
			return new Date()
		}
	},

	deps: {
		test: ['TestDep', {x: 12}]
	},
	
	computed: {
		c () {
			let {a, b} = this
			return a + b
		}
	},

	provided: {
		_: ['a', 'b'],
		'rand': 'k'
	},

	serializers: {
		d: {
			to (v) {
				// console.log('serializing', v, v.getTime())
				return v.getTime().toString(24)
			},
			from (b) { 
				return new Date(parseInt(b, 24))
			}
		}
	}
})

describe('Obj usability', () => {
	let o = new Test({ a: 1 })

	describe('props', () => {

		it('missing required throws', () =>
			assert.throws(() => new Test({}))
		)

		it('can read props', () => {
			assert.equal(o.a, 1)
			assert.equal(o.b, 10)
			assert.equal(o.k, o.k)
			assert(o.d instanceof Date)
		})

		it('cannot write props', () =>
			assert.throws(() => o.a = 1)
		)
	})

	describe('computed', () => {

		it('can read', () =>
			assert.equal(o.c, 11)
		)

		it('cannot write', () =>
			assert.throws(() => o.c = 3)
		)
	})

	describe('deps', () => {

		it('works with defaults', () =>
			assert.equal(o.test.x, 12)
		)

		it('works with assignment', () =>
			assert.equal(new Test({
				a: 1,
				test: { x: 22 }
			}).test.x, 22)
		)
	})

	describe('provision/injection', () => {

		it('normally works', () =>
			assert.equal(o.test.rand, o.k)
		)

		it('returns undefined when no provision', () =>
			assert.strictEqual(o.test.lol, undefined)
		)
	})

	describe('serialization', () => {
		let ser = Obj.serialize(o)
		let des = Obj.deserialize(ser)

		it('normally works', () => {
			assert.equal(o.a, des.a)
			assert.equal(o.b, des.b)
			assert.equal(o.d.getTime(), des.d.getTime())
			assert.equal(o.test.rand, des.test.rand)
			assert.equal(o.test.x, des.test.x)
		})

		it('serializers work', () => {
			assert.equal(Test._def.serializers.d.from(ser[1].d).getTime(), o.d.getTime()) 
		})
	})

})