class ObjError extends Error {

}

class Obj {
	constructor (args = {}, extras = {}) {
		Object.assign(this, extras)

		const def = Object.getPrototypeOf(this).constructor._def

		let precomputed = [], values = {}

		if (this._deserialize) {
			Object.keys(def.serializers).forEach(k => {
				if (k in args)
					args[k] = def.serializers[k].from.bind(this)(args[k])
			})
		}

		Object.keys(def.props).forEach(k => {
			let prop = def.props[k]
			
			if (k in args) {
				let v = args[k]
				values[k] = v
			} else {
				if (typeof prop === "undefined")
					throw new ObjError(`missing required value for: ${k}`)

				if (typeof prop === 'function')
					precomputed.push(k)
			}
		})

		Object.keys(def.deps).forEach(k => {
			let dep = def.deps[k]

			if (args[k] instanceof Obj) {  // set instantiated object
				values[k] = ObjInfo.fromObj(args[k])
				Object.defineProperty(this, k, { get: () => args[k], set: _immutableSet })
				return
			}

			if (typeof dep === "undefined")
				if (k in args)
					dep = _normalizeDep(args[k])
				else
					throw new ObjError(`missing required value for dep: ${k}`)
			else
				dep = dep.merge(k in args ? (this._deserialize ? new ObjInfo(...args[k]) : args[k]) : null)

			values[k] = dep
			this._deserialize && precomputed.push(k)
		})

		this._values = values

		precomputed.forEach(pk => {
			let _ = this[pk]
		})

		delete this._deserialize

		def.init && def.init.call(this)
	}

	$instantiate (info) {
		return Obj.instantiate(info, this)
	}

	$serialize () {
		return Obj.serialize(this)
	}

	$deserialize (info) {
		return Obj.deserialize(info, this)
	}
}

Object.assign(Obj, {
	registry: {},

	lookupClass (name) {
		return this.registry[name]
	},

	lookupDef (name) {
		return this.registry[name]._def
	},

	getDef (obj) {
		return Object.getPrototypeOf(obj).constructor._def
	},

	getName (obj) {
		return this.getDef(obj).name
	},

	instantiate (info, _parent, _deserialize) {
		let extras = {}
		if (_parent) {
			extras._parent = _parent
			if (_parent._deserialize)
				_deserialize = true
		}

		if (_deserialize)
			extras._deserialize = true

		info = _normalizeDep(info)
		
		let cls = this.lookupClass(info.name)
		if (!cls)
			throw new ObjError(`Class ${info.name} not defined`)

		return new cls(Object.assign({}, info.args), extras)
	},

	serialize (obj) {
		let def = this.getDef(obj)
		let serializers = def.serializers
		let args = {}

		Object.keys(def.props).forEach(k => {
			let arg = obj[k]
			if (k in serializers)
				arg = serializers[k].to.bind(obj)(arg)
			args[k] = arg
		})

		Object.keys(def.deps).forEach(k => {
			let arg = obj[k]
			arg = this.serialize(arg)
			if (k in serializers)
				arg = serializers[k].to.bind(obj)(arg)
			args[k] = arg
		})

		return [def.name, args]
	},

	deserialize (arr, _parent) {
		return this.instantiate(new ObjInfo(...arr), _parent, true)
	}
})

class ObjInfo {
	constructor (name, args) {
		if (typeof name !== "string")
			name = Obj.getDef(name).name

		this.name = name
		this.args = args || {}
	}

	merge (arg) {
		if (!arg) 
			return new ObjInfo(this.name, this.args)

		if (arg instanceof ObjInfo)
			return arg

		if (typeof arg === "string")
			return new ObjInfo(arg, this.args)

		if (typeof arg === "object")
			return new ObjInfo(this.name, Object.assign({}, this.args, arg))

		throw new ObjError("bad argument")
	}

	static fromObj (obj) {
		// const def = obj.prototype.constructor.def
		const name = Object.getPrototypeOf(obj).constructor.name
		const args = Object.assign({}, obj._values)
		return new this(name, args)
	}

	toArray () {
		let args = Object.assign(this.args)
		Object.keys(args).forEach(k => {
			if (args[k] instanceof ObjInfo)
				args[k] = args[k].toArray()
		})
		return [this.name, args]
	}
}

function _immutableSet () {
	throw new ObjError("cannot set immutable attribute")
}

function _normalizeDep(dep) {
	if (typeof dep === "string")
		return new ObjInfo(dep)

	if (typeof dep === "undefined")
		return dep

	if (dep.prototype instanceof Obj)
		return new ObjInfo(dep.name)

	if (dep instanceof Array)
		return new ObjInfo(...dep)

	if (dep instanceof ObjInfo)
		return dep

	console.error(dep)
	throw new ObjError("invalid value for dependency")
}

function _normalizeRefs(o) {
	var a
	if (o instanceof Array) {
		a = o; o = {}
	} else if ('_' in o) {
		a = o._
		delete o._
	}

	a && a.forEach(k => o[k] = k)
	return o
}

function makeObj(/* [name], def */) {
	let name, def = {}
	{
		let args = Array.from(arguments), arg

		arg = args.shift()
		switch (typeof arg) {
			case "string":
				name = arg; def = args.shift(); break
			case "object":
				def = arg; break
		}

		name && (def.name = name) || (name = def.name)
	}

	let base = def.inherits || Obj
	if (typeof base === "string")
		base = Obj.registry[base]


	// set correct name for dynamically created class
	// method 1: 
	const cls = eval(`
			(function () {
				let ${name || 'cls'} = class extends base { }
				return ${name || 'cls'}
			})()`)

	// const cls = class extends base { }
	const proto = cls.prototype

	if (name) {
		// method 2: (does not really work)
		// Object.defineProperty(cls.prototype.constructor, 'name', { get: () => def.name })
		Obj.registry[def.name] = cls
	}

	def = Object.assign({
		props: {},
		deps: {},
		computed: {},
		methods: {},
		provided: {},
		injected: {},
		serializers: {}
	}, def)

	{
		let props = def.props
		Object.keys(props).forEach(k => {
			let prop = props[k]

			Object.defineProperty(proto, k, {get () { 
				let _values = this._values

				if (k in _values)
					return _values[k]

				if (typeof prop === 'function') {
					return _values[k] = prop.bind(this)()
				}

				return _values[k] = prop

			}, set: _immutableSet })
		})
	}

	{
		let deps = def.deps

		Object.keys(deps).forEach(k => {
			let dep = deps[k] = _normalizeDep(deps[k])

			Object.defineProperty(proto, k, { get () {
				let obj = Obj.instantiate(this._values[k], this)
				this._values[k] = ObjInfo.fromObj(obj)
				Object.defineProperty(this, k, { get: () => obj, set: _immutableSet })
				return obj
			}, set: _immutableSet })
		})
	}

	{
		let computed = def.computed
		
		Object.keys(computed).forEach(k => {
			let f = computed[k]
			Object.defineProperty(proto, k, { get () { 
				let value = f.bind(this)()
				Object.defineProperty(this, k, { get: () => value, set: _immutableSet })
				return value
			}, set: _immutableSet })
		})
	}

	{
		let methods = def.methods
		Object.keys(methods).forEach(k => {
			proto[k] = methods[k]
		})
	}

	def.provided = _normalizeRefs(def.provided)
	def.injected = _normalizeRefs(def.injected)

	{
		let injected = def.injected

		Object.keys(injected).forEach(k => {
			let lookup = injected[k]

			Object.defineProperty(proto, k, { get () {
				let o = this
				while (o) {
					let provider = Object.getPrototypeOf(o).constructor._def.provided[k]
					if (provider) {
						let value = o[provider]
						Object.defineProperty(this, k, { get: () => value, set: _immutableSet })
						return value
					}
					o = o._parent
				}
			}, set: _immutableSet })
		})
	}

	if (base !== Obj)
		['props', 'deps', 'computed', 'provided', 'injected', 'serializers'].forEach(k =>
			def[k] = Object.assign({}, base._def[k], def[k])
		)

	cls._def = def

	return cls
}

//Object.assign(makeObj, { Obj, ObjInfo, ObjError })

Object.assign(Obj, {
	make: makeObj,
	Info: ObjInfo,
	Error: ObjError
})

module.exports = Obj