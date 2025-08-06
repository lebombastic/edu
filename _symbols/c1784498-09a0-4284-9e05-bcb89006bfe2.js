// New Block - Updated August 6, 2025
function noop() { }
function run(fn) {
    return fn();
}
function blank_object() {
    return Object.create(null);
}
function run_all(fns) {
    fns.forEach(run);
}
function is_function(thing) {
    return typeof thing === 'function';
}
function safe_not_equal(a, b) {
    return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
}
function is_empty(obj) {
    return Object.keys(obj).length === 0;
}

// Track which nodes are claimed during hydration. Unclaimed nodes can then be removed from the DOM
// at the end of hydration without touching the remaining nodes.
let is_hydrating = false;
function start_hydrating() {
    is_hydrating = true;
}
function end_hydrating() {
    is_hydrating = false;
}
function upper_bound(low, high, key, value) {
    // Return first index of value larger than input value in the range [low, high)
    while (low < high) {
        const mid = low + ((high - low) >> 1);
        if (key(mid) <= value) {
            low = mid + 1;
        }
        else {
            high = mid;
        }
    }
    return low;
}
function init_hydrate(target) {
    if (target.hydrate_init)
        return;
    target.hydrate_init = true;
    // We know that all children have claim_order values since the unclaimed have been detached if target is not <head>
    let children = target.childNodes;
    // If target is <head>, there may be children without claim_order
    if (target.nodeName === 'HEAD') {
        const myChildren = [];
        for (let i = 0; i < children.length; i++) {
            const node = children[i];
            if (node.claim_order !== undefined) {
                myChildren.push(node);
            }
        }
        children = myChildren;
    }
    /*
    * Reorder claimed children optimally.
    * We can reorder claimed children optimally by finding the longest subsequence of
    * nodes that are already claimed in order and only moving the rest. The longest
    * subsequence of nodes that are claimed in order can be found by
    * computing the longest increasing subsequence of .claim_order values.
    *
    * This algorithm is optimal in generating the least amount of reorder operations
    * possible.
    *
    * Proof:
    * We know that, given a set of reordering operations, the nodes that do not move
    * always form an increasing subsequence, since they do not move among each other
    * meaning that they must be already ordered among each other. Thus, the maximal
    * set of nodes that do not move form a longest increasing subsequence.
    */
    // Compute longest increasing subsequence
    // m: subsequence length j => index k of smallest value that ends an increasing subsequence of length j
    const m = new Int32Array(children.length + 1);
    // Predecessor indices + 1
    const p = new Int32Array(children.length);
    m[0] = -1;
    let longest = 0;
    for (let i = 0; i < children.length; i++) {
        const current = children[i].claim_order;
        // Find the largest subsequence length such that it ends in a value less than our current value
        // upper_bound returns first greater value, so we subtract one
        // with fast path for when we are on the current longest subsequence
        const seqLen = ((longest > 0 && children[m[longest]].claim_order <= current) ? longest + 1 : upper_bound(1, longest, idx => children[m[idx]].claim_order, current)) - 1;
        p[i] = m[seqLen] + 1;
        const newLen = seqLen + 1;
        // We can guarantee that current is the smallest value. Otherwise, we would have generated a longer sequence.
        m[newLen] = i;
        longest = Math.max(newLen, longest);
    }
    // The longest increasing subsequence of nodes (initially reversed)
    const lis = [];
    // The rest of the nodes, nodes that will be moved
    const toMove = [];
    let last = children.length - 1;
    for (let cur = m[longest] + 1; cur != 0; cur = p[cur - 1]) {
        lis.push(children[cur - 1]);
        for (; last >= cur; last--) {
            toMove.push(children[last]);
        }
        last--;
    }
    for (; last >= 0; last--) {
        toMove.push(children[last]);
    }
    lis.reverse();
    // We sort the nodes being moved to guarantee that their insertion order matches the claim order
    toMove.sort((a, b) => a.claim_order - b.claim_order);
    // Finally, we move the nodes
    for (let i = 0, j = 0; i < toMove.length; i++) {
        while (j < lis.length && toMove[i].claim_order >= lis[j].claim_order) {
            j++;
        }
        const anchor = j < lis.length ? lis[j] : null;
        target.insertBefore(toMove[i], anchor);
    }
}
function append_hydration(target, node) {
    if (is_hydrating) {
        init_hydrate(target);
        if ((target.actual_end_child === undefined) || ((target.actual_end_child !== null) && (target.actual_end_child.parentNode !== target))) {
            target.actual_end_child = target.firstChild;
        }
        // Skip nodes of undefined ordering
        while ((target.actual_end_child !== null) && (target.actual_end_child.claim_order === undefined)) {
            target.actual_end_child = target.actual_end_child.nextSibling;
        }
        if (node !== target.actual_end_child) {
            // We only insert if the ordering of this node should be modified or the parent node is not target
            if (node.claim_order !== undefined || node.parentNode !== target) {
                target.insertBefore(node, target.actual_end_child);
            }
        }
        else {
            target.actual_end_child = node.nextSibling;
        }
    }
    else if (node.parentNode !== target || node.nextSibling !== null) {
        target.appendChild(node);
    }
}
function insert_hydration(target, node, anchor) {
    if (is_hydrating && !anchor) {
        append_hydration(target, node);
    }
    else if (node.parentNode !== target || node.nextSibling != anchor) {
        target.insertBefore(node, anchor || null);
    }
}
function detach(node) {
    if (node.parentNode) {
        node.parentNode.removeChild(node);
    }
}
function destroy_each(iterations, detaching) {
    for (let i = 0; i < iterations.length; i += 1) {
        if (iterations[i])
            iterations[i].d(detaching);
    }
}
function element(name) {
    return document.createElement(name);
}
function text(data) {
    return document.createTextNode(data);
}
function space() {
    return text(' ');
}
function empty() {
    return text('');
}
function listen(node, event, handler, options) {
    node.addEventListener(event, handler, options);
    return () => node.removeEventListener(event, handler, options);
}
function attr(node, attribute, value) {
    if (value == null)
        node.removeAttribute(attribute);
    else if (node.getAttribute(attribute) !== value)
        node.setAttribute(attribute, value);
}
function children(element) {
    return Array.from(element.childNodes);
}
function init_claim_info(nodes) {
    if (nodes.claim_info === undefined) {
        nodes.claim_info = { last_index: 0, total_claimed: 0 };
    }
}
function claim_node(nodes, predicate, processNode, createNode, dontUpdateLastIndex = false) {
    // Try to find nodes in an order such that we lengthen the longest increasing subsequence
    init_claim_info(nodes);
    const resultNode = (() => {
        // We first try to find an element after the previous one
        for (let i = nodes.claim_info.last_index; i < nodes.length; i++) {
            const node = nodes[i];
            if (predicate(node)) {
                const replacement = processNode(node);
                if (replacement === undefined) {
                    nodes.splice(i, 1);
                }
                else {
                    nodes[i] = replacement;
                }
                if (!dontUpdateLastIndex) {
                    nodes.claim_info.last_index = i;
                }
                return node;
            }
        }
        // Otherwise, we try to find one before
        // We iterate in reverse so that we don't go too far back
        for (let i = nodes.claim_info.last_index - 1; i >= 0; i--) {
            const node = nodes[i];
            if (predicate(node)) {
                const replacement = processNode(node);
                if (replacement === undefined) {
                    nodes.splice(i, 1);
                }
                else {
                    nodes[i] = replacement;
                }
                if (!dontUpdateLastIndex) {
                    nodes.claim_info.last_index = i;
                }
                else if (replacement === undefined) {
                    // Since we spliced before the last_index, we decrease it
                    nodes.claim_info.last_index--;
                }
                return node;
            }
        }
        // If we can't find any matching node, we create a new one
        return createNode();
    })();
    resultNode.claim_order = nodes.claim_info.total_claimed;
    nodes.claim_info.total_claimed += 1;
    return resultNode;
}
function claim_element_base(nodes, name, attributes, create_element) {
    return claim_node(nodes, (node) => node.nodeName === name, (node) => {
        const remove = [];
        for (let j = 0; j < node.attributes.length; j++) {
            const attribute = node.attributes[j];
            if (!attributes[attribute.name]) {
                remove.push(attribute.name);
            }
        }
        remove.forEach(v => node.removeAttribute(v));
        return undefined;
    }, () => create_element(name));
}
function claim_element(nodes, name, attributes) {
    return claim_element_base(nodes, name, attributes, element);
}
function claim_text(nodes, data) {
    return claim_node(nodes, (node) => node.nodeType === 3, (node) => {
        const dataStr = '' + data;
        if (node.data.startsWith(dataStr)) {
            if (node.data.length !== dataStr.length) {
                return node.splitText(dataStr.length);
            }
        }
        else {
            node.data = dataStr;
        }
    }, () => text(data), true // Text nodes should not update last index since it is likely not worth it to eliminate an increasing subsequence of actual elements
    );
}
function claim_space(nodes) {
    return claim_text(nodes, ' ');
}
function set_data(text, data) {
    data = '' + data;
    if (text.data === data)
        return;
    text.data = data;
}

let current_component;
function set_current_component(component) {
    current_component = component;
}

const dirty_components = [];
const binding_callbacks = [];
let render_callbacks = [];
const flush_callbacks = [];
const resolved_promise = /* @__PURE__ */ Promise.resolve();
let update_scheduled = false;
function schedule_update() {
    if (!update_scheduled) {
        update_scheduled = true;
        resolved_promise.then(flush);
    }
}
function add_render_callback(fn) {
    render_callbacks.push(fn);
}
// flush() calls callbacks in this order:
// 1. All beforeUpdate callbacks, in order: parents before children
// 2. All bind:this callbacks, in reverse order: children before parents.
// 3. All afterUpdate callbacks, in order: parents before children. EXCEPT
//    for afterUpdates called during the initial onMount, which are called in
//    reverse order: children before parents.
// Since callbacks might update component values, which could trigger another
// call to flush(), the following steps guard against this:
// 1. During beforeUpdate, any updated components will be added to the
//    dirty_components array and will cause a reentrant call to flush(). Because
//    the flush index is kept outside the function, the reentrant call will pick
//    up where the earlier call left off and go through all dirty components. The
//    current_component value is saved and restored so that the reentrant call will
//    not interfere with the "parent" flush() call.
// 2. bind:this callbacks cannot trigger new flush() calls.
// 3. During afterUpdate, any updated components will NOT have their afterUpdate
//    callback called a second time; the seen_callbacks set, outside the flush()
//    function, guarantees this behavior.
const seen_callbacks = new Set();
let flushidx = 0; // Do *not* move this inside the flush() function
function flush() {
    // Do not reenter flush while dirty components are updated, as this can
    // result in an infinite loop. Instead, let the inner flush handle it.
    // Reentrancy is ok afterwards for bindings etc.
    if (flushidx !== 0) {
        return;
    }
    const saved_component = current_component;
    do {
        // first, call beforeUpdate functions
        // and update components
        try {
            while (flushidx < dirty_components.length) {
                const component = dirty_components[flushidx];
                flushidx++;
                set_current_component(component);
                update(component.$$);
            }
        }
        catch (e) {
            // reset dirty state to not end up in a deadlocked state and then rethrow
            dirty_components.length = 0;
            flushidx = 0;
            throw e;
        }
        set_current_component(null);
        dirty_components.length = 0;
        flushidx = 0;
        while (binding_callbacks.length)
            binding_callbacks.pop()();
        // then, once components are updated, call
        // afterUpdate functions. This may cause
        // subsequent updates...
        for (let i = 0; i < render_callbacks.length; i += 1) {
            const callback = render_callbacks[i];
            if (!seen_callbacks.has(callback)) {
                // ...so guard against infinite loops
                seen_callbacks.add(callback);
                callback();
            }
        }
        render_callbacks.length = 0;
    } while (dirty_components.length);
    while (flush_callbacks.length) {
        flush_callbacks.pop()();
    }
    update_scheduled = false;
    seen_callbacks.clear();
    set_current_component(saved_component);
}
function update($$) {
    if ($$.fragment !== null) {
        $$.update();
        run_all($$.before_update);
        const dirty = $$.dirty;
        $$.dirty = [-1];
        $$.fragment && $$.fragment.p($$.ctx, dirty);
        $$.after_update.forEach(add_render_callback);
    }
}
/**
 * Useful for example to execute remaining `afterUpdate` callbacks before executing `destroy`.
 */
function flush_render_callbacks(fns) {
    const filtered = [];
    const targets = [];
    render_callbacks.forEach((c) => fns.indexOf(c) === -1 ? filtered.push(c) : targets.push(c));
    targets.forEach((c) => c());
    render_callbacks = filtered;
}
const outroing = new Set();
function transition_in(block, local) {
    if (block && block.i) {
        outroing.delete(block);
        block.i(local);
    }
}
function mount_component(component, target, anchor, customElement) {
    const { fragment, after_update } = component.$$;
    fragment && fragment.m(target, anchor);
    if (!customElement) {
        // onMount happens before the initial afterUpdate
        add_render_callback(() => {
            const new_on_destroy = component.$$.on_mount.map(run).filter(is_function);
            // if the component was destroyed immediately
            // it will update the `$$.on_destroy` reference to `null`.
            // the destructured on_destroy may still reference to the old array
            if (component.$$.on_destroy) {
                component.$$.on_destroy.push(...new_on_destroy);
            }
            else {
                // Edge case - component was destroyed immediately,
                // most likely as a result of a binding initialising
                run_all(new_on_destroy);
            }
            component.$$.on_mount = [];
        });
    }
    after_update.forEach(add_render_callback);
}
function destroy_component(component, detaching) {
    const $$ = component.$$;
    if ($$.fragment !== null) {
        flush_render_callbacks($$.after_update);
        run_all($$.on_destroy);
        $$.fragment && $$.fragment.d(detaching);
        // TODO null out other refs, including component.$$ (but need to
        // preserve final state?)
        $$.on_destroy = $$.fragment = null;
        $$.ctx = [];
    }
}
function make_dirty(component, i) {
    if (component.$$.dirty[0] === -1) {
        dirty_components.push(component);
        schedule_update();
        component.$$.dirty.fill(0);
    }
    component.$$.dirty[(i / 31) | 0] |= (1 << (i % 31));
}
function init(component, options, instance, create_fragment, not_equal, props, append_styles, dirty = [-1]) {
    const parent_component = current_component;
    set_current_component(component);
    const $$ = component.$$ = {
        fragment: null,
        ctx: [],
        // state
        props,
        update: noop,
        not_equal,
        bound: blank_object(),
        // lifecycle
        on_mount: [],
        on_destroy: [],
        on_disconnect: [],
        before_update: [],
        after_update: [],
        context: new Map(options.context || (parent_component ? parent_component.$$.context : [])),
        // everything else
        callbacks: blank_object(),
        dirty,
        skip_bound: false,
        root: options.target || parent_component.$$.root
    };
    append_styles && append_styles($$.root);
    let ready = false;
    $$.ctx = instance
        ? instance(component, options.props || {}, (i, ret, ...rest) => {
            const value = rest.length ? rest[0] : ret;
            if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
                if (!$$.skip_bound && $$.bound[i])
                    $$.bound[i](value);
                if (ready)
                    make_dirty(component, i);
            }
            return ret;
        })
        : [];
    $$.update();
    ready = true;
    run_all($$.before_update);
    // `false` as a special case of no DOM component
    $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
    if (options.target) {
        if (options.hydrate) {
            start_hydrating();
            const nodes = children(options.target);
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            $$.fragment && $$.fragment.l(nodes);
            nodes.forEach(detach);
        }
        else {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            $$.fragment && $$.fragment.c();
        }
        if (options.intro)
            transition_in(component.$$.fragment);
        mount_component(component, options.target, options.anchor, options.customElement);
        end_hydrating();
        flush();
    }
    set_current_component(parent_component);
}
/**
 * Base class for Svelte components. Used when dev=false.
 */
class SvelteComponent {
    $destroy() {
        destroy_component(this, 1);
        this.$destroy = noop;
    }
    $on(type, callback) {
        if (!is_function(callback)) {
            return noop;
        }
        const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
        callbacks.push(callback);
        return () => {
            const index = callbacks.indexOf(callback);
            if (index !== -1)
                callbacks.splice(index, 1);
        };
    }
    $set($$props) {
        if (this.$$set && !is_empty($$props)) {
            this.$$.skip_bound = true;
            this.$$set($$props);
            this.$$.skip_bound = false;
        }
    }
}

/* generated by Svelte v3.59.1 */

function get_each_context_6(ctx, list, i) {
	const child_ctx = ctx.slice();
	child_ctx[47] = list[i][0];
	child_ctx[48] = list[i][1];
	return child_ctx;
}

function get_each_context_7(ctx, list, i) {
	const child_ctx = ctx.slice();
	child_ctx[32] = list[i];
	return child_ctx;
}

function get_each_context_8(ctx, list, i) {
	const child_ctx = ctx.slice();
	child_ctx[47] = list[i][0];
	child_ctx[48] = list[i][1];
	return child_ctx;
}

function get_each_context_9(ctx, list, i) {
	const child_ctx = ctx.slice();
	child_ctx[32] = list[i];
	return child_ctx;
}

function get_each_context_3(ctx, list, i) {
	const child_ctx = ctx.slice();
	child_ctx[38] = list[i];
	return child_ctx;
}

function get_each_context_4(ctx, list, i) {
	const child_ctx = ctx.slice();
	child_ctx[41] = list[i];
	return child_ctx;
}

function get_each_context_5(ctx, list, i) {
	const child_ctx = ctx.slice();
	child_ctx[44] = list[i];
	return child_ctx;
}

function get_each_context(ctx, list, i) {
	const child_ctx = ctx.slice();
	child_ctx[29] = list[i];
	child_ctx[31] = i;
	return child_ctx;
}

function get_each_context_1(ctx, list, i) {
	const child_ctx = ctx.slice();
	child_ctx[32] = list[i];
	return child_ctx;
}

function get_each_context_2(ctx, list, i) {
	const child_ctx = ctx.slice();
	child_ctx[35] = list[i];
	return child_ctx;
}

function get_each_context_10(ctx, list, i) {
	const child_ctx = ctx.slice();
	child_ctx[57] = list[i];
	return child_ctx;
}

function get_each_context_11(ctx, list, i) {
	const child_ctx = ctx.slice();
	child_ctx[60] = list[i][0];
	child_ctx[61] = list[i][1];
	return child_ctx;
}

// (1008:6) {#each Object.entries(modules) as [moduleId, module]}
function create_each_block_11(ctx) {
	let button;
	let span0;
	let t0_value = /*module*/ ctx[61].icon + "";
	let t0;
	let t1;
	let span1;
	let t2_value = /*module*/ ctx[61].title + "";
	let t2;
	let t3;
	let span2;
	let t4;
	let t5_value = /*module*/ ctx[61].weeks[0] + "";
	let t5;
	let t6;
	let t7_value = /*module*/ ctx[61].weeks[/*module*/ ctx[61].weeks.length - 1] + "";
	let t7;
	let t8;
	let button_class_value;
	let mounted;
	let dispose;

	function click_handler_1() {
		return /*click_handler_1*/ ctx[14](/*moduleId*/ ctx[60]);
	}

	return {
		c() {
			button = element("button");
			span0 = element("span");
			t0 = text(t0_value);
			t1 = space();
			span1 = element("span");
			t2 = text(t2_value);
			t3 = space();
			span2 = element("span");
			t4 = text("Weeks ");
			t5 = text(t5_value);
			t6 = text("-");
			t7 = text(t7_value);
			t8 = space();
			this.h();
		},
		l(nodes) {
			button = claim_element(nodes, "BUTTON", { class: true });
			var button_nodes = children(button);
			span0 = claim_element(button_nodes, "SPAN", { class: true });
			var span0_nodes = children(span0);
			t0 = claim_text(span0_nodes, t0_value);
			span0_nodes.forEach(detach);
			t1 = claim_space(button_nodes);
			span1 = claim_element(button_nodes, "SPAN", { class: true });
			var span1_nodes = children(span1);
			t2 = claim_text(span1_nodes, t2_value);
			span1_nodes.forEach(detach);
			t3 = claim_space(button_nodes);
			span2 = claim_element(button_nodes, "SPAN", { class: true });
			var span2_nodes = children(span2);
			t4 = claim_text(span2_nodes, "Weeks ");
			t5 = claim_text(span2_nodes, t5_value);
			t6 = claim_text(span2_nodes, "-");
			t7 = claim_text(span2_nodes, t7_value);
			span2_nodes.forEach(detach);
			t8 = claim_space(button_nodes);
			button_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(span0, "class", "tab-icon svelte-18lncot");
			attr(span1, "class", "tab-title svelte-18lncot");
			attr(span2, "class", "tab-weeks svelte-18lncot");

			attr(button, "class", button_class_value = "module-tab " + (/*moduleId*/ ctx[60] === /*selectedModule*/ ctx[1]
			? 'active'
			: '') + " " + /*module*/ ctx[61].color + " svelte-18lncot");
		},
		m(target, anchor) {
			insert_hydration(target, button, anchor);
			append_hydration(button, span0);
			append_hydration(span0, t0);
			append_hydration(button, t1);
			append_hydration(button, span1);
			append_hydration(span1, t2);
			append_hydration(button, t3);
			append_hydration(button, span2);
			append_hydration(span2, t4);
			append_hydration(span2, t5);
			append_hydration(span2, t6);
			append_hydration(span2, t7);
			append_hydration(button, t8);

			if (!mounted) {
				dispose = listen(button, "click", click_handler_1);
				mounted = true;
			}
		},
		p(new_ctx, dirty) {
			ctx = new_ctx;

			if (dirty[0] & /*selectedModule*/ 2 && button_class_value !== (button_class_value = "module-tab " + (/*moduleId*/ ctx[60] === /*selectedModule*/ ctx[1]
			? 'active'
			: '') + " " + /*module*/ ctx[61].color + " svelte-18lncot")) {
				attr(button, "class", button_class_value);
			}
		},
		d(detaching) {
			if (detaching) detach(button);
			mounted = false;
			dispose();
		}
	};
}

// (1034:60) 
function create_if_block_24(ctx) {
	let div;
	let t;

	return {
		c() {
			div = element("div");
			t = text("Test");
			this.h();
		},
		l(nodes) {
			div = claim_element(nodes, "DIV", { class: true });
			var div_nodes = children(div);
			t = claim_text(div_nodes, "Test");
			div_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(div, "class", "assessment-badge test svelte-18lncot");
		},
		m(target, anchor) {
			insert_hydration(target, div, anchor);
			append_hydration(div, t);
		},
		d(detaching) {
			if (detaching) detach(div);
		}
	};
}

// (1032:10) {#if week === 2 || week === 6 || week === 10}
function create_if_block_23(ctx) {
	let div;
	let t;

	return {
		c() {
			div = element("div");
			t = text("Quiz");
			this.h();
		},
		l(nodes) {
			div = claim_element(nodes, "DIV", { class: true });
			var div_nodes = children(div);
			t = claim_text(div_nodes, "Quiz");
			div_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(div, "class", "assessment-badge quiz svelte-18lncot");
		},
		m(target, anchor) {
			insert_hydration(target, div, anchor);
			append_hydration(div, t);
		},
		d(detaching) {
			if (detaching) detach(div);
		}
	};
}

// (1025:6) {#each currentModule.weeks as week}
function create_each_block_10(ctx) {
	let button;
	let div0;
	let t0;
	let t1_value = /*week*/ ctx[57] + "";
	let t1;
	let t2;
	let div1;
	let t3_value = (/*weeklyContent*/ ctx[8][/*week*/ ctx[57]]?.title || 'Coming Soon') + "";
	let t3;
	let t4;
	let t5;
	let button_class_value;
	let mounted;
	let dispose;

	function select_block_type(ctx, dirty) {
		if (/*week*/ ctx[57] === 2 || /*week*/ ctx[57] === 6 || /*week*/ ctx[57] === 10) return create_if_block_23;
		if (/*week*/ ctx[57] === 4 || /*week*/ ctx[57] === 8 || /*week*/ ctx[57] === 12) return create_if_block_24;
	}

	let current_block_type = select_block_type(ctx);
	let if_block = current_block_type && current_block_type(ctx);

	function click_handler_2() {
		return /*click_handler_2*/ ctx[15](/*week*/ ctx[57]);
	}

	return {
		c() {
			button = element("button");
			div0 = element("div");
			t0 = text("Week ");
			t1 = text(t1_value);
			t2 = space();
			div1 = element("div");
			t3 = text(t3_value);
			t4 = space();
			if (if_block) if_block.c();
			t5 = space();
			this.h();
		},
		l(nodes) {
			button = claim_element(nodes, "BUTTON", { class: true });
			var button_nodes = children(button);
			div0 = claim_element(button_nodes, "DIV", { class: true });
			var div0_nodes = children(div0);
			t0 = claim_text(div0_nodes, "Week ");
			t1 = claim_text(div0_nodes, t1_value);
			div0_nodes.forEach(detach);
			t2 = claim_space(button_nodes);
			div1 = claim_element(button_nodes, "DIV", { class: true });
			var div1_nodes = children(div1);
			t3 = claim_text(div1_nodes, t3_value);
			div1_nodes.forEach(detach);
			t4 = claim_space(button_nodes);
			if (if_block) if_block.l(button_nodes);
			t5 = claim_space(button_nodes);
			button_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(div0, "class", "week-number svelte-18lncot");
			attr(div1, "class", "week-title svelte-18lncot");

			attr(button, "class", button_class_value = "week-button " + (/*week*/ ctx[57] === /*selectedWeek*/ ctx[2]
			? 'active'
			: '') + " svelte-18lncot");
		},
		m(target, anchor) {
			insert_hydration(target, button, anchor);
			append_hydration(button, div0);
			append_hydration(div0, t0);
			append_hydration(div0, t1);
			append_hydration(button, t2);
			append_hydration(button, div1);
			append_hydration(div1, t3);
			append_hydration(button, t4);
			if (if_block) if_block.m(button, null);
			append_hydration(button, t5);

			if (!mounted) {
				dispose = listen(button, "click", click_handler_2);
				mounted = true;
			}
		},
		p(new_ctx, dirty) {
			ctx = new_ctx;
			if (dirty[0] & /*currentModule*/ 32 && t1_value !== (t1_value = /*week*/ ctx[57] + "")) set_data(t1, t1_value);
			if (dirty[0] & /*currentModule*/ 32 && t3_value !== (t3_value = (/*weeklyContent*/ ctx[8][/*week*/ ctx[57]]?.title || 'Coming Soon') + "")) set_data(t3, t3_value);

			if (current_block_type !== (current_block_type = select_block_type(ctx))) {
				if (if_block) if_block.d(1);
				if_block = current_block_type && current_block_type(ctx);

				if (if_block) {
					if_block.c();
					if_block.m(button, t5);
				}
			}

			if (dirty[0] & /*currentModule, selectedWeek*/ 36 && button_class_value !== (button_class_value = "week-button " + (/*week*/ ctx[57] === /*selectedWeek*/ ctx[2]
			? 'active'
			: '') + " svelte-18lncot")) {
				attr(button, "class", button_class_value);
			}
		},
		d(detaching) {
			if (detaching) detach(button);

			if (if_block) {
				if_block.d();
			}

			mounted = false;
			dispose();
		}
	};
}

// (1389:0) {:else}
function create_else_block(ctx) {
	let div2;
	let div1;
	let div0;
	let t0;
	let t1;
	let h3;
	let t2;
	let t3;
	let p;
	let t4;
	let t5;
	let t6;
	let t7;
	let button;
	let t8;
	let mounted;
	let dispose;

	return {
		c() {
			div2 = element("div");
			div1 = element("div");
			div0 = element("div");
			t0 = text("📚");
			t1 = space();
			h3 = element("h3");
			t2 = text("Content Coming Soon");
			t3 = space();
			p = element("p");
			t4 = text("Detailed lesson plans for Week ");
			t5 = text(/*selectedWeek*/ ctx[2]);
			t6 = text(" are currently being developed.");
			t7 = space();
			button = element("button");
			t8 = text("View Available Content");
			this.h();
		},
		l(nodes) {
			div2 = claim_element(nodes, "DIV", { class: true });
			var div2_nodes = children(div2);
			div1 = claim_element(div2_nodes, "DIV", { class: true });
			var div1_nodes = children(div1);
			div0 = claim_element(div1_nodes, "DIV", { class: true });
			var div0_nodes = children(div0);
			t0 = claim_text(div0_nodes, "📚");
			div0_nodes.forEach(detach);
			t1 = claim_space(div1_nodes);
			h3 = claim_element(div1_nodes, "H3", { class: true });
			var h3_nodes = children(h3);
			t2 = claim_text(h3_nodes, "Content Coming Soon");
			h3_nodes.forEach(detach);
			t3 = claim_space(div1_nodes);
			p = claim_element(div1_nodes, "P", { class: true });
			var p_nodes = children(p);
			t4 = claim_text(p_nodes, "Detailed lesson plans for Week ");
			t5 = claim_text(p_nodes, /*selectedWeek*/ ctx[2]);
			t6 = claim_text(p_nodes, " are currently being developed.");
			p_nodes.forEach(detach);
			t7 = claim_space(div1_nodes);
			button = claim_element(div1_nodes, "BUTTON", { class: true });
			var button_nodes = children(button);
			t8 = claim_text(button_nodes, "View Available Content");
			button_nodes.forEach(detach);
			div1_nodes.forEach(detach);
			div2_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(div0, "class", "no-content-icon svelte-18lncot");
			attr(h3, "class", "svelte-18lncot");
			attr(p, "class", "svelte-18lncot");
			attr(button, "class", "btn btn-primary");
			attr(div1, "class", "no-content-card svelte-18lncot");
			attr(div2, "class", "no-content svelte-18lncot");
		},
		m(target, anchor) {
			insert_hydration(target, div2, anchor);
			append_hydration(div2, div1);
			append_hydration(div1, div0);
			append_hydration(div0, t0);
			append_hydration(div1, t1);
			append_hydration(div1, h3);
			append_hydration(h3, t2);
			append_hydration(div1, t3);
			append_hydration(div1, p);
			append_hydration(p, t4);
			append_hydration(p, t5);
			append_hydration(p, t6);
			append_hydration(div1, t7);
			append_hydration(div1, button);
			append_hydration(button, t8);

			if (!mounted) {
				dispose = listen(button, "click", /*click_handler_15*/ ctx[28]);
				mounted = true;
			}
		},
		p(ctx, dirty) {
			if (dirty[0] & /*selectedWeek*/ 4) set_data(t5, /*selectedWeek*/ ctx[2]);
		},
		d(detaching) {
			if (detaching) detach(div2);
			mounted = false;
			dispose();
		}
	};
}

// (1044:0) {#if currentWeek}
function create_if_block(ctx) {
	let div4;
	let div0;
	let button0;
	let span0;
	let t0;
	let t1;
	let button0_class_value;
	let t2;
	let button1;
	let span1;
	let t3;
	let t4;
	let button1_class_value;
	let t5;
	let button2;
	let span2;
	let t6;
	let t7;
	let button2_class_value;
	let t8;
	let div3;
	let div2;
	let h2;
	let t9;
	let t10;
	let t11;
	let t12_value = /*currentWeek*/ ctx[6].title + "";
	let t12;
	let t13;
	let div1;
	let span3;
	let t14_value = /*currentModule*/ ctx[5].icon + "";
	let t14;
	let t15;
	let t16_value = /*currentModule*/ ctx[5].title + "";
	let t16;
	let span3_class_value;
	let t17;
	let span4;
	let t18;
	let t19_value = (/*currentWeek*/ ctx[6].lesson?.duration || '90 minutes') + "";
	let t19;
	let t20;
	let mounted;
	let dispose;

	function select_block_type_2(ctx, dirty) {
		if (/*activeTab*/ ctx[3] === 'lesson') return create_if_block_1;
		if (/*activeTab*/ ctx[3] === 'teacher-notes') return create_if_block_7;
		if (/*activeTab*/ ctx[3] === 'activities') return create_if_block_14;
	}

	let current_block_type = select_block_type_2(ctx);
	let if_block = current_block_type && current_block_type(ctx);

	return {
		c() {
			div4 = element("div");
			div0 = element("div");
			button0 = element("button");
			span0 = element("span");
			t0 = text("📚");
			t1 = text("\n        Lesson Plan");
			t2 = space();
			button1 = element("button");
			span1 = element("span");
			t3 = text("👨‍🏫");
			t4 = text("\n        Teacher Notes");
			t5 = space();
			button2 = element("button");
			span2 = element("span");
			t6 = text("🎯");
			t7 = text("\n        Activities");
			t8 = space();
			div3 = element("div");
			div2 = element("div");
			h2 = element("h2");
			t9 = text("Week ");
			t10 = text(/*selectedWeek*/ ctx[2]);
			t11 = text(": ");
			t12 = text(t12_value);
			t13 = space();
			div1 = element("div");
			span3 = element("span");
			t14 = text(t14_value);
			t15 = space();
			t16 = text(t16_value);
			t17 = space();
			span4 = element("span");
			t18 = text("⏱️ ");
			t19 = text(t19_value);
			t20 = space();
			if (if_block) if_block.c();
			this.h();
		},
		l(nodes) {
			div4 = claim_element(nodes, "DIV", { class: true });
			var div4_nodes = children(div4);
			div0 = claim_element(div4_nodes, "DIV", { class: true });
			var div0_nodes = children(div0);
			button0 = claim_element(div0_nodes, "BUTTON", { class: true });
			var button0_nodes = children(button0);
			span0 = claim_element(button0_nodes, "SPAN", { class: true });
			var span0_nodes = children(span0);
			t0 = claim_text(span0_nodes, "📚");
			span0_nodes.forEach(detach);
			t1 = claim_text(button0_nodes, "\n        Lesson Plan");
			button0_nodes.forEach(detach);
			t2 = claim_space(div0_nodes);
			button1 = claim_element(div0_nodes, "BUTTON", { class: true });
			var button1_nodes = children(button1);
			span1 = claim_element(button1_nodes, "SPAN", { class: true });
			var span1_nodes = children(span1);
			t3 = claim_text(span1_nodes, "👨‍🏫");
			span1_nodes.forEach(detach);
			t4 = claim_text(button1_nodes, "\n        Teacher Notes");
			button1_nodes.forEach(detach);
			t5 = claim_space(div0_nodes);
			button2 = claim_element(div0_nodes, "BUTTON", { class: true });
			var button2_nodes = children(button2);
			span2 = claim_element(button2_nodes, "SPAN", { class: true });
			var span2_nodes = children(span2);
			t6 = claim_text(span2_nodes, "🎯");
			span2_nodes.forEach(detach);
			t7 = claim_text(button2_nodes, "\n        Activities");
			button2_nodes.forEach(detach);
			div0_nodes.forEach(detach);
			t8 = claim_space(div4_nodes);
			div3 = claim_element(div4_nodes, "DIV", { class: true });
			var div3_nodes = children(div3);
			div2 = claim_element(div3_nodes, "DIV", { class: true });
			var div2_nodes = children(div2);
			h2 = claim_element(div2_nodes, "H2", { class: true });
			var h2_nodes = children(h2);
			t9 = claim_text(h2_nodes, "Week ");
			t10 = claim_text(h2_nodes, /*selectedWeek*/ ctx[2]);
			t11 = claim_text(h2_nodes, ": ");
			t12 = claim_text(h2_nodes, t12_value);
			h2_nodes.forEach(detach);
			t13 = claim_space(div2_nodes);
			div1 = claim_element(div2_nodes, "DIV", { class: true });
			var div1_nodes = children(div1);
			span3 = claim_element(div1_nodes, "SPAN", { class: true });
			var span3_nodes = children(span3);
			t14 = claim_text(span3_nodes, t14_value);
			t15 = claim_space(span3_nodes);
			t16 = claim_text(span3_nodes, t16_value);
			span3_nodes.forEach(detach);
			t17 = claim_space(div1_nodes);
			span4 = claim_element(div1_nodes, "SPAN", { class: true });
			var span4_nodes = children(span4);
			t18 = claim_text(span4_nodes, "⏱️ ");
			t19 = claim_text(span4_nodes, t19_value);
			span4_nodes.forEach(detach);
			div1_nodes.forEach(detach);
			div2_nodes.forEach(detach);
			div3_nodes.forEach(detach);
			t20 = claim_space(div4_nodes);
			if (if_block) if_block.l(div4_nodes);
			div4_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(span0, "class", "tab-icon svelte-18lncot");
			attr(button0, "class", button0_class_value = "tab-button " + (/*activeTab*/ ctx[3] === 'lesson' ? 'active' : '') + " svelte-18lncot");
			attr(span1, "class", "tab-icon svelte-18lncot");
			attr(button1, "class", button1_class_value = "tab-button " + (/*activeTab*/ ctx[3] === 'teacher-notes' ? 'active' : '') + " svelte-18lncot");
			attr(span2, "class", "tab-icon svelte-18lncot");
			attr(button2, "class", button2_class_value = "tab-button " + (/*activeTab*/ ctx[3] === 'activities' ? 'active' : '') + " svelte-18lncot");
			attr(div0, "class", "content-tabs svelte-18lncot");
			attr(h2, "class", "svelte-18lncot");
			attr(span3, "class", span3_class_value = "module-badge " + /*currentModule*/ ctx[5].color + " svelte-18lncot");
			attr(span4, "class", "duration-badge svelte-18lncot");
			attr(div1, "class", "lesson-meta svelte-18lncot");
			attr(div2, "class", "lesson-title svelte-18lncot");
			attr(div3, "class", "lesson-header svelte-18lncot");
			attr(div4, "class", "lesson-content svelte-18lncot");
		},
		m(target, anchor) {
			insert_hydration(target, div4, anchor);
			append_hydration(div4, div0);
			append_hydration(div0, button0);
			append_hydration(button0, span0);
			append_hydration(span0, t0);
			append_hydration(button0, t1);
			append_hydration(div0, t2);
			append_hydration(div0, button1);
			append_hydration(button1, span1);
			append_hydration(span1, t3);
			append_hydration(button1, t4);
			append_hydration(div0, t5);
			append_hydration(div0, button2);
			append_hydration(button2, span2);
			append_hydration(span2, t6);
			append_hydration(button2, t7);
			append_hydration(div4, t8);
			append_hydration(div4, div3);
			append_hydration(div3, div2);
			append_hydration(div2, h2);
			append_hydration(h2, t9);
			append_hydration(h2, t10);
			append_hydration(h2, t11);
			append_hydration(h2, t12);
			append_hydration(div2, t13);
			append_hydration(div2, div1);
			append_hydration(div1, span3);
			append_hydration(span3, t14);
			append_hydration(span3, t15);
			append_hydration(span3, t16);
			append_hydration(div1, t17);
			append_hydration(div1, span4);
			append_hydration(span4, t18);
			append_hydration(span4, t19);
			append_hydration(div4, t20);
			if (if_block) if_block.m(div4, null);

			if (!mounted) {
				dispose = [
					listen(button0, "click", /*click_handler_3*/ ctx[16]),
					listen(button1, "click", /*click_handler_4*/ ctx[17]),
					listen(button2, "click", /*click_handler_5*/ ctx[18])
				];

				mounted = true;
			}
		},
		p(ctx, dirty) {
			if (dirty[0] & /*activeTab*/ 8 && button0_class_value !== (button0_class_value = "tab-button " + (/*activeTab*/ ctx[3] === 'lesson' ? 'active' : '') + " svelte-18lncot")) {
				attr(button0, "class", button0_class_value);
			}

			if (dirty[0] & /*activeTab*/ 8 && button1_class_value !== (button1_class_value = "tab-button " + (/*activeTab*/ ctx[3] === 'teacher-notes' ? 'active' : '') + " svelte-18lncot")) {
				attr(button1, "class", button1_class_value);
			}

			if (dirty[0] & /*activeTab*/ 8 && button2_class_value !== (button2_class_value = "tab-button " + (/*activeTab*/ ctx[3] === 'activities' ? 'active' : '') + " svelte-18lncot")) {
				attr(button2, "class", button2_class_value);
			}

			if (dirty[0] & /*selectedWeek*/ 4) set_data(t10, /*selectedWeek*/ ctx[2]);
			if (dirty[0] & /*currentWeek*/ 64 && t12_value !== (t12_value = /*currentWeek*/ ctx[6].title + "")) set_data(t12, t12_value);
			if (dirty[0] & /*currentModule*/ 32 && t14_value !== (t14_value = /*currentModule*/ ctx[5].icon + "")) set_data(t14, t14_value);
			if (dirty[0] & /*currentModule*/ 32 && t16_value !== (t16_value = /*currentModule*/ ctx[5].title + "")) set_data(t16, t16_value);

			if (dirty[0] & /*currentModule*/ 32 && span3_class_value !== (span3_class_value = "module-badge " + /*currentModule*/ ctx[5].color + " svelte-18lncot")) {
				attr(span3, "class", span3_class_value);
			}

			if (dirty[0] & /*currentWeek*/ 64 && t19_value !== (t19_value = (/*currentWeek*/ ctx[6].lesson?.duration || '90 minutes') + "")) set_data(t19, t19_value);

			if (current_block_type === (current_block_type = select_block_type_2(ctx)) && if_block) {
				if_block.p(ctx, dirty);
			} else {
				if (if_block) if_block.d(1);
				if_block = current_block_type && current_block_type(ctx);

				if (if_block) {
					if_block.c();
					if_block.m(div4, null);
				}
			}
		},
		d(detaching) {
			if (detaching) detach(div4);

			if (if_block) {
				if_block.d();
			}

			mounted = false;
			run_all(dispose);
		}
	};
}

// (1307:41) 
function create_if_block_14(ctx) {
	let div;
	let t;
	let if_block0 = /*currentWeek*/ ctx[6].activities.icebreaker && create_if_block_19(ctx);
	let if_block1 = /*currentWeek*/ ctx[6].activities.mindGame && create_if_block_15(ctx);

	return {
		c() {
			div = element("div");
			if (if_block0) if_block0.c();
			t = space();
			if (if_block1) if_block1.c();
			this.h();
		},
		l(nodes) {
			div = claim_element(nodes, "DIV", { class: true });
			var div_nodes = children(div);
			if (if_block0) if_block0.l(div_nodes);
			t = claim_space(div_nodes);
			if (if_block1) if_block1.l(div_nodes);
			div_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(div, "class", "activities-content svelte-18lncot");
		},
		m(target, anchor) {
			insert_hydration(target, div, anchor);
			if (if_block0) if_block0.m(div, null);
			append_hydration(div, t);
			if (if_block1) if_block1.m(div, null);
		},
		p(ctx, dirty) {
			if (/*currentWeek*/ ctx[6].activities.icebreaker) {
				if (if_block0) {
					if_block0.p(ctx, dirty);
				} else {
					if_block0 = create_if_block_19(ctx);
					if_block0.c();
					if_block0.m(div, t);
				}
			} else if (if_block0) {
				if_block0.d(1);
				if_block0 = null;
			}

			if (/*currentWeek*/ ctx[6].activities.mindGame) {
				if (if_block1) {
					if_block1.p(ctx, dirty);
				} else {
					if_block1 = create_if_block_15(ctx);
					if_block1.c();
					if_block1.m(div, null);
				}
			} else if (if_block1) {
				if_block1.d(1);
				if_block1 = null;
			}
		},
		d(detaching) {
			if (detaching) detach(div);
			if (if_block0) if_block0.d();
			if (if_block1) if_block1.d();
		}
	};
}

// (1206:44) 
function create_if_block_7(ctx) {
	let div2;
	let div0;
	let button0;
	let h30;
	let t0;
	let t1;
	let span0;
	let t2;
	let span0_class_value;
	let t3;
	let show_if_1 = /*expandedSections*/ ctx[4].has('preparation');
	let t4;
	let div1;
	let button1;
	let h31;
	let t5;
	let t6;
	let span1;
	let t7;
	let span1_class_value;
	let t8;
	let show_if = /*expandedSections*/ ctx[4].has('adaptations');
	let t9;
	let t10;
	let mounted;
	let dispose;
	let if_block0 = show_if_1 && create_if_block_13(ctx);
	let if_block1 = show_if && create_if_block_12(ctx);
	let if_block2 = /*currentWeek*/ ctx[6].teacherNotes.commonChallenges && create_if_block_10(ctx);
	let if_block3 = /*currentWeek*/ ctx[6].teacherNotes.extensions && create_if_block_8(ctx);

	return {
		c() {
			div2 = element("div");
			div0 = element("div");
			button0 = element("button");
			h30 = element("h3");
			t0 = text("Lesson Preparation");
			t1 = space();
			span0 = element("span");
			t2 = text("▼");
			t3 = space();
			if (if_block0) if_block0.c();
			t4 = space();
			div1 = element("div");
			button1 = element("button");
			h31 = element("h3");
			t5 = text("Age Group Adaptations");
			t6 = space();
			span1 = element("span");
			t7 = text("▼");
			t8 = space();
			if (if_block1) if_block1.c();
			t9 = space();
			if (if_block2) if_block2.c();
			t10 = space();
			if (if_block3) if_block3.c();
			this.h();
		},
		l(nodes) {
			div2 = claim_element(nodes, "DIV", { class: true });
			var div2_nodes = children(div2);
			div0 = claim_element(div2_nodes, "DIV", { class: true });
			var div0_nodes = children(div0);
			button0 = claim_element(div0_nodes, "BUTTON", { class: true });
			var button0_nodes = children(button0);
			h30 = claim_element(button0_nodes, "H3", { class: true });
			var h30_nodes = children(h30);
			t0 = claim_text(h30_nodes, "Lesson Preparation");
			h30_nodes.forEach(detach);
			t1 = claim_space(button0_nodes);
			span0 = claim_element(button0_nodes, "SPAN", { class: true });
			var span0_nodes = children(span0);
			t2 = claim_text(span0_nodes, "▼");
			span0_nodes.forEach(detach);
			button0_nodes.forEach(detach);
			t3 = claim_space(div0_nodes);
			if (if_block0) if_block0.l(div0_nodes);
			div0_nodes.forEach(detach);
			t4 = claim_space(div2_nodes);
			div1 = claim_element(div2_nodes, "DIV", { class: true });
			var div1_nodes = children(div1);
			button1 = claim_element(div1_nodes, "BUTTON", { class: true });
			var button1_nodes = children(button1);
			h31 = claim_element(button1_nodes, "H3", { class: true });
			var h31_nodes = children(h31);
			t5 = claim_text(h31_nodes, "Age Group Adaptations");
			h31_nodes.forEach(detach);
			t6 = claim_space(button1_nodes);
			span1 = claim_element(button1_nodes, "SPAN", { class: true });
			var span1_nodes = children(span1);
			t7 = claim_text(span1_nodes, "▼");
			span1_nodes.forEach(detach);
			button1_nodes.forEach(detach);
			t8 = claim_space(div1_nodes);
			if (if_block1) if_block1.l(div1_nodes);
			div1_nodes.forEach(detach);
			t9 = claim_space(div2_nodes);
			if (if_block2) if_block2.l(div2_nodes);
			t10 = claim_space(div2_nodes);
			if (if_block3) if_block3.l(div2_nodes);
			div2_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(h30, "class", "svelte-18lncot");

			attr(span0, "class", span0_class_value = "expand-icon " + (/*expandedSections*/ ctx[4].has('preparation')
			? 'expanded'
			: '') + " svelte-18lncot");

			attr(button0, "class", "section-header svelte-18lncot");
			attr(div0, "class", "content-section svelte-18lncot");
			attr(h31, "class", "svelte-18lncot");

			attr(span1, "class", span1_class_value = "expand-icon " + (/*expandedSections*/ ctx[4].has('adaptations')
			? 'expanded'
			: '') + " svelte-18lncot");

			attr(button1, "class", "section-header svelte-18lncot");
			attr(div1, "class", "content-section svelte-18lncot");
			attr(div2, "class", "teacher-notes");
		},
		m(target, anchor) {
			insert_hydration(target, div2, anchor);
			append_hydration(div2, div0);
			append_hydration(div0, button0);
			append_hydration(button0, h30);
			append_hydration(h30, t0);
			append_hydration(button0, t1);
			append_hydration(button0, span0);
			append_hydration(span0, t2);
			append_hydration(div0, t3);
			if (if_block0) if_block0.m(div0, null);
			append_hydration(div2, t4);
			append_hydration(div2, div1);
			append_hydration(div1, button1);
			append_hydration(button1, h31);
			append_hydration(h31, t5);
			append_hydration(button1, t6);
			append_hydration(button1, span1);
			append_hydration(span1, t7);
			append_hydration(div1, t8);
			if (if_block1) if_block1.m(div1, null);
			append_hydration(div2, t9);
			if (if_block2) if_block2.m(div2, null);
			append_hydration(div2, t10);
			if (if_block3) if_block3.m(div2, null);

			if (!mounted) {
				dispose = [
					listen(button0, "click", /*click_handler_11*/ ctx[24]),
					listen(button1, "click", /*click_handler_12*/ ctx[25])
				];

				mounted = true;
			}
		},
		p(ctx, dirty) {
			if (dirty[0] & /*expandedSections*/ 16 && span0_class_value !== (span0_class_value = "expand-icon " + (/*expandedSections*/ ctx[4].has('preparation')
			? 'expanded'
			: '') + " svelte-18lncot")) {
				attr(span0, "class", span0_class_value);
			}

			if (dirty[0] & /*expandedSections*/ 16) show_if_1 = /*expandedSections*/ ctx[4].has('preparation');

			if (show_if_1) {
				if (if_block0) {
					if_block0.p(ctx, dirty);
				} else {
					if_block0 = create_if_block_13(ctx);
					if_block0.c();
					if_block0.m(div0, null);
				}
			} else if (if_block0) {
				if_block0.d(1);
				if_block0 = null;
			}

			if (dirty[0] & /*expandedSections*/ 16 && span1_class_value !== (span1_class_value = "expand-icon " + (/*expandedSections*/ ctx[4].has('adaptations')
			? 'expanded'
			: '') + " svelte-18lncot")) {
				attr(span1, "class", span1_class_value);
			}

			if (dirty[0] & /*expandedSections*/ 16) show_if = /*expandedSections*/ ctx[4].has('adaptations');

			if (show_if) {
				if (if_block1) {
					if_block1.p(ctx, dirty);
				} else {
					if_block1 = create_if_block_12(ctx);
					if_block1.c();
					if_block1.m(div1, null);
				}
			} else if (if_block1) {
				if_block1.d(1);
				if_block1 = null;
			}

			if (/*currentWeek*/ ctx[6].teacherNotes.commonChallenges) {
				if (if_block2) {
					if_block2.p(ctx, dirty);
				} else {
					if_block2 = create_if_block_10(ctx);
					if_block2.c();
					if_block2.m(div2, t10);
				}
			} else if (if_block2) {
				if_block2.d(1);
				if_block2 = null;
			}

			if (/*currentWeek*/ ctx[6].teacherNotes.extensions) {
				if (if_block3) {
					if_block3.p(ctx, dirty);
				} else {
					if_block3 = create_if_block_8(ctx);
					if_block3.c();
					if_block3.m(div2, null);
				}
			} else if (if_block3) {
				if_block3.d(1);
				if_block3 = null;
			}
		},
		d(detaching) {
			if (detaching) detach(div2);
			if (if_block0) if_block0.d();
			if (if_block1) if_block1.d();
			if (if_block2) if_block2.d();
			if (if_block3) if_block3.d();
			mounted = false;
			run_all(dispose);
		}
	};
}

// (1086:4) {#if activeTab === 'lesson'}
function create_if_block_1(ctx) {
	let div0;
	let button0;
	let h30;
	let t0;
	let t1;
	let span0;
	let t2;
	let span0_class_value;
	let t3;
	let show_if_4 = /*expandedSections*/ ctx[4].has('objectives');
	let t4;
	let div1;
	let button1;
	let h31;
	let t5;
	let t6;
	let span1;
	let t7;
	let span1_class_value;
	let t8;
	let show_if_3 = /*expandedSections*/ ctx[4].has('materials');
	let t9;
	let div2;
	let button2;
	let h32;
	let t10;
	let t11;
	let span2;
	let t12;
	let span2_class_value;
	let t13;
	let show_if_2 = /*expandedSections*/ ctx[4].has('introduction');
	let t14;
	let div3;
	let button3;
	let h33;
	let t15;
	let t16;
	let span3;
	let t17;
	let span3_class_value;
	let t18;
	let show_if_1 = /*expandedSections*/ ctx[4].has('main-content');
	let t19;
	let div4;
	let button4;
	let h34;
	let t20;
	let t21;
	let span4;
	let t22;
	let span4_class_value;
	let t23;
	let show_if = /*expandedSections*/ ctx[4].has('assessment');
	let mounted;
	let dispose;
	let if_block0 = show_if_4 && create_if_block_6(ctx);
	let if_block1 = show_if_3 && create_if_block_5(ctx);
	let if_block2 = show_if_2 && create_if_block_4(ctx);
	let if_block3 = show_if_1 && create_if_block_3(ctx);
	let if_block4 = show_if && create_if_block_2(ctx);

	return {
		c() {
			div0 = element("div");
			button0 = element("button");
			h30 = element("h3");
			t0 = text("Learning Objectives");
			t1 = space();
			span0 = element("span");
			t2 = text("▼");
			t3 = space();
			if (if_block0) if_block0.c();
			t4 = space();
			div1 = element("div");
			button1 = element("button");
			h31 = element("h3");
			t5 = text("Materials & Resources");
			t6 = space();
			span1 = element("span");
			t7 = text("▼");
			t8 = space();
			if (if_block1) if_block1.c();
			t9 = space();
			div2 = element("div");
			button2 = element("button");
			h32 = element("h3");
			t10 = text("Lesson Introduction");
			t11 = space();
			span2 = element("span");
			t12 = text("▼");
			t13 = space();
			if (if_block2) if_block2.c();
			t14 = space();
			div3 = element("div");
			button3 = element("button");
			h33 = element("h3");
			t15 = text("Main Lesson Content");
			t16 = space();
			span3 = element("span");
			t17 = text("▼");
			t18 = space();
			if (if_block3) if_block3.c();
			t19 = space();
			div4 = element("div");
			button4 = element("button");
			h34 = element("h3");
			t20 = text("Assessment & Homework");
			t21 = space();
			span4 = element("span");
			t22 = text("▼");
			t23 = space();
			if (if_block4) if_block4.c();
			this.h();
		},
		l(nodes) {
			div0 = claim_element(nodes, "DIV", { class: true });
			var div0_nodes = children(div0);
			button0 = claim_element(div0_nodes, "BUTTON", { class: true });
			var button0_nodes = children(button0);
			h30 = claim_element(button0_nodes, "H3", { class: true });
			var h30_nodes = children(h30);
			t0 = claim_text(h30_nodes, "Learning Objectives");
			h30_nodes.forEach(detach);
			t1 = claim_space(button0_nodes);
			span0 = claim_element(button0_nodes, "SPAN", { class: true });
			var span0_nodes = children(span0);
			t2 = claim_text(span0_nodes, "▼");
			span0_nodes.forEach(detach);
			button0_nodes.forEach(detach);
			t3 = claim_space(div0_nodes);
			if (if_block0) if_block0.l(div0_nodes);
			div0_nodes.forEach(detach);
			t4 = claim_space(nodes);
			div1 = claim_element(nodes, "DIV", { class: true });
			var div1_nodes = children(div1);
			button1 = claim_element(div1_nodes, "BUTTON", { class: true });
			var button1_nodes = children(button1);
			h31 = claim_element(button1_nodes, "H3", { class: true });
			var h31_nodes = children(h31);
			t5 = claim_text(h31_nodes, "Materials & Resources");
			h31_nodes.forEach(detach);
			t6 = claim_space(button1_nodes);
			span1 = claim_element(button1_nodes, "SPAN", { class: true });
			var span1_nodes = children(span1);
			t7 = claim_text(span1_nodes, "▼");
			span1_nodes.forEach(detach);
			button1_nodes.forEach(detach);
			t8 = claim_space(div1_nodes);
			if (if_block1) if_block1.l(div1_nodes);
			div1_nodes.forEach(detach);
			t9 = claim_space(nodes);
			div2 = claim_element(nodes, "DIV", { class: true });
			var div2_nodes = children(div2);
			button2 = claim_element(div2_nodes, "BUTTON", { class: true });
			var button2_nodes = children(button2);
			h32 = claim_element(button2_nodes, "H3", { class: true });
			var h32_nodes = children(h32);
			t10 = claim_text(h32_nodes, "Lesson Introduction");
			h32_nodes.forEach(detach);
			t11 = claim_space(button2_nodes);
			span2 = claim_element(button2_nodes, "SPAN", { class: true });
			var span2_nodes = children(span2);
			t12 = claim_text(span2_nodes, "▼");
			span2_nodes.forEach(detach);
			button2_nodes.forEach(detach);
			t13 = claim_space(div2_nodes);
			if (if_block2) if_block2.l(div2_nodes);
			div2_nodes.forEach(detach);
			t14 = claim_space(nodes);
			div3 = claim_element(nodes, "DIV", { class: true });
			var div3_nodes = children(div3);
			button3 = claim_element(div3_nodes, "BUTTON", { class: true });
			var button3_nodes = children(button3);
			h33 = claim_element(button3_nodes, "H3", { class: true });
			var h33_nodes = children(h33);
			t15 = claim_text(h33_nodes, "Main Lesson Content");
			h33_nodes.forEach(detach);
			t16 = claim_space(button3_nodes);
			span3 = claim_element(button3_nodes, "SPAN", { class: true });
			var span3_nodes = children(span3);
			t17 = claim_text(span3_nodes, "▼");
			span3_nodes.forEach(detach);
			button3_nodes.forEach(detach);
			t18 = claim_space(div3_nodes);
			if (if_block3) if_block3.l(div3_nodes);
			div3_nodes.forEach(detach);
			t19 = claim_space(nodes);
			div4 = claim_element(nodes, "DIV", { class: true });
			var div4_nodes = children(div4);
			button4 = claim_element(div4_nodes, "BUTTON", { class: true });
			var button4_nodes = children(button4);
			h34 = claim_element(button4_nodes, "H3", { class: true });
			var h34_nodes = children(h34);
			t20 = claim_text(h34_nodes, "Assessment & Homework");
			h34_nodes.forEach(detach);
			t21 = claim_space(button4_nodes);
			span4 = claim_element(button4_nodes, "SPAN", { class: true });
			var span4_nodes = children(span4);
			t22 = claim_text(span4_nodes, "▼");
			span4_nodes.forEach(detach);
			button4_nodes.forEach(detach);
			t23 = claim_space(div4_nodes);
			if (if_block4) if_block4.l(div4_nodes);
			div4_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(h30, "class", "svelte-18lncot");

			attr(span0, "class", span0_class_value = "expand-icon " + (/*expandedSections*/ ctx[4].has('objectives')
			? 'expanded'
			: '') + " svelte-18lncot");

			attr(button0, "class", "section-header svelte-18lncot");
			attr(div0, "class", "content-section svelte-18lncot");
			attr(h31, "class", "svelte-18lncot");

			attr(span1, "class", span1_class_value = "expand-icon " + (/*expandedSections*/ ctx[4].has('materials')
			? 'expanded'
			: '') + " svelte-18lncot");

			attr(button1, "class", "section-header svelte-18lncot");
			attr(div1, "class", "content-section svelte-18lncot");
			attr(h32, "class", "svelte-18lncot");

			attr(span2, "class", span2_class_value = "expand-icon " + (/*expandedSections*/ ctx[4].has('introduction')
			? 'expanded'
			: '') + " svelte-18lncot");

			attr(button2, "class", "section-header svelte-18lncot");
			attr(div2, "class", "content-section svelte-18lncot");
			attr(h33, "class", "svelte-18lncot");

			attr(span3, "class", span3_class_value = "expand-icon " + (/*expandedSections*/ ctx[4].has('main-content')
			? 'expanded'
			: '') + " svelte-18lncot");

			attr(button3, "class", "section-header svelte-18lncot");
			attr(div3, "class", "content-section svelte-18lncot");
			attr(h34, "class", "svelte-18lncot");

			attr(span4, "class", span4_class_value = "expand-icon " + (/*expandedSections*/ ctx[4].has('assessment')
			? 'expanded'
			: '') + " svelte-18lncot");

			attr(button4, "class", "section-header svelte-18lncot");
			attr(div4, "class", "content-section svelte-18lncot");
		},
		m(target, anchor) {
			insert_hydration(target, div0, anchor);
			append_hydration(div0, button0);
			append_hydration(button0, h30);
			append_hydration(h30, t0);
			append_hydration(button0, t1);
			append_hydration(button0, span0);
			append_hydration(span0, t2);
			append_hydration(div0, t3);
			if (if_block0) if_block0.m(div0, null);
			insert_hydration(target, t4, anchor);
			insert_hydration(target, div1, anchor);
			append_hydration(div1, button1);
			append_hydration(button1, h31);
			append_hydration(h31, t5);
			append_hydration(button1, t6);
			append_hydration(button1, span1);
			append_hydration(span1, t7);
			append_hydration(div1, t8);
			if (if_block1) if_block1.m(div1, null);
			insert_hydration(target, t9, anchor);
			insert_hydration(target, div2, anchor);
			append_hydration(div2, button2);
			append_hydration(button2, h32);
			append_hydration(h32, t10);
			append_hydration(button2, t11);
			append_hydration(button2, span2);
			append_hydration(span2, t12);
			append_hydration(div2, t13);
			if (if_block2) if_block2.m(div2, null);
			insert_hydration(target, t14, anchor);
			insert_hydration(target, div3, anchor);
			append_hydration(div3, button3);
			append_hydration(button3, h33);
			append_hydration(h33, t15);
			append_hydration(button3, t16);
			append_hydration(button3, span3);
			append_hydration(span3, t17);
			append_hydration(div3, t18);
			if (if_block3) if_block3.m(div3, null);
			insert_hydration(target, t19, anchor);
			insert_hydration(target, div4, anchor);
			append_hydration(div4, button4);
			append_hydration(button4, h34);
			append_hydration(h34, t20);
			append_hydration(button4, t21);
			append_hydration(button4, span4);
			append_hydration(span4, t22);
			append_hydration(div4, t23);
			if (if_block4) if_block4.m(div4, null);

			if (!mounted) {
				dispose = [
					listen(button0, "click", /*click_handler_6*/ ctx[19]),
					listen(button1, "click", /*click_handler_7*/ ctx[20]),
					listen(button2, "click", /*click_handler_8*/ ctx[21]),
					listen(button3, "click", /*click_handler_9*/ ctx[22]),
					listen(button4, "click", /*click_handler_10*/ ctx[23])
				];

				mounted = true;
			}
		},
		p(ctx, dirty) {
			if (dirty[0] & /*expandedSections*/ 16 && span0_class_value !== (span0_class_value = "expand-icon " + (/*expandedSections*/ ctx[4].has('objectives')
			? 'expanded'
			: '') + " svelte-18lncot")) {
				attr(span0, "class", span0_class_value);
			}

			if (dirty[0] & /*expandedSections*/ 16) show_if_4 = /*expandedSections*/ ctx[4].has('objectives');

			if (show_if_4) {
				if (if_block0) {
					if_block0.p(ctx, dirty);
				} else {
					if_block0 = create_if_block_6(ctx);
					if_block0.c();
					if_block0.m(div0, null);
				}
			} else if (if_block0) {
				if_block0.d(1);
				if_block0 = null;
			}

			if (dirty[0] & /*expandedSections*/ 16 && span1_class_value !== (span1_class_value = "expand-icon " + (/*expandedSections*/ ctx[4].has('materials')
			? 'expanded'
			: '') + " svelte-18lncot")) {
				attr(span1, "class", span1_class_value);
			}

			if (dirty[0] & /*expandedSections*/ 16) show_if_3 = /*expandedSections*/ ctx[4].has('materials');

			if (show_if_3) {
				if (if_block1) {
					if_block1.p(ctx, dirty);
				} else {
					if_block1 = create_if_block_5(ctx);
					if_block1.c();
					if_block1.m(div1, null);
				}
			} else if (if_block1) {
				if_block1.d(1);
				if_block1 = null;
			}

			if (dirty[0] & /*expandedSections*/ 16 && span2_class_value !== (span2_class_value = "expand-icon " + (/*expandedSections*/ ctx[4].has('introduction')
			? 'expanded'
			: '') + " svelte-18lncot")) {
				attr(span2, "class", span2_class_value);
			}

			if (dirty[0] & /*expandedSections*/ 16) show_if_2 = /*expandedSections*/ ctx[4].has('introduction');

			if (show_if_2) {
				if (if_block2) {
					if_block2.p(ctx, dirty);
				} else {
					if_block2 = create_if_block_4(ctx);
					if_block2.c();
					if_block2.m(div2, null);
				}
			} else if (if_block2) {
				if_block2.d(1);
				if_block2 = null;
			}

			if (dirty[0] & /*expandedSections*/ 16 && span3_class_value !== (span3_class_value = "expand-icon " + (/*expandedSections*/ ctx[4].has('main-content')
			? 'expanded'
			: '') + " svelte-18lncot")) {
				attr(span3, "class", span3_class_value);
			}

			if (dirty[0] & /*expandedSections*/ 16) show_if_1 = /*expandedSections*/ ctx[4].has('main-content');

			if (show_if_1) {
				if (if_block3) {
					if_block3.p(ctx, dirty);
				} else {
					if_block3 = create_if_block_3(ctx);
					if_block3.c();
					if_block3.m(div3, null);
				}
			} else if (if_block3) {
				if_block3.d(1);
				if_block3 = null;
			}

			if (dirty[0] & /*expandedSections*/ 16 && span4_class_value !== (span4_class_value = "expand-icon " + (/*expandedSections*/ ctx[4].has('assessment')
			? 'expanded'
			: '') + " svelte-18lncot")) {
				attr(span4, "class", span4_class_value);
			}

			if (dirty[0] & /*expandedSections*/ 16) show_if = /*expandedSections*/ ctx[4].has('assessment');

			if (show_if) {
				if (if_block4) {
					if_block4.p(ctx, dirty);
				} else {
					if_block4 = create_if_block_2(ctx);
					if_block4.c();
					if_block4.m(div4, null);
				}
			} else if (if_block4) {
				if_block4.d(1);
				if_block4 = null;
			}
		},
		d(detaching) {
			if (detaching) detach(div0);
			if (if_block0) if_block0.d();
			if (detaching) detach(t4);
			if (detaching) detach(div1);
			if (if_block1) if_block1.d();
			if (detaching) detach(t9);
			if (detaching) detach(div2);
			if (if_block2) if_block2.d();
			if (detaching) detach(t14);
			if (detaching) detach(div3);
			if (if_block3) if_block3.d();
			if (detaching) detach(t19);
			if (detaching) detach(div4);
			if (if_block4) if_block4.d();
			mounted = false;
			run_all(dispose);
		}
	};
}

// (1311:8) {#if currentWeek.activities.icebreaker}
function create_if_block_19(ctx) {
	let div4;
	let div0;
	let h3;
	let t0;
	let t1;
	let span;
	let t2;
	let t3_value = /*currentWeek*/ ctx[6].activities.icebreaker.duration + "";
	let t3;
	let t4;
	let div3;
	let h4;
	let t5_value = /*currentWeek*/ ctx[6].activities.icebreaker.title + "";
	let t5;
	let t6;
	let p;
	let t7_value = /*currentWeek*/ ctx[6].activities.icebreaker.description + "";
	let t7;
	let t8;
	let div1;
	let strong;
	let t9;
	let t10;
	let ul;
	let t11;
	let div2;
	let h5;
	let t12;
	let t13;
	let each_value_9 = /*currentWeek*/ ctx[6].activities.icebreaker.materials;
	let each_blocks_1 = [];

	for (let i = 0; i < each_value_9.length; i += 1) {
		each_blocks_1[i] = create_each_block_9(get_each_context_9(ctx, each_value_9, i));
	}

	let each_value_8 = Object.entries(/*currentWeek*/ ctx[6].activities.icebreaker.ageAdaptations);
	let each_blocks = [];

	for (let i = 0; i < each_value_8.length; i += 1) {
		each_blocks[i] = create_each_block_8(get_each_context_8(ctx, each_value_8, i));
	}

	return {
		c() {
			div4 = element("div");
			div0 = element("div");
			h3 = element("h3");
			t0 = text("🧊 Icebreaker Activity");
			t1 = space();
			span = element("span");
			t2 = text("⏱️ ");
			t3 = text(t3_value);
			t4 = space();
			div3 = element("div");
			h4 = element("h4");
			t5 = text(t5_value);
			t6 = space();
			p = element("p");
			t7 = text(t7_value);
			t8 = space();
			div1 = element("div");
			strong = element("strong");
			t9 = text("Materials needed:");
			t10 = space();
			ul = element("ul");

			for (let i = 0; i < each_blocks_1.length; i += 1) {
				each_blocks_1[i].c();
			}

			t11 = space();
			div2 = element("div");
			h5 = element("h5");
			t12 = text("Age Group Adaptations:");
			t13 = space();

			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].c();
			}

			this.h();
		},
		l(nodes) {
			div4 = claim_element(nodes, "DIV", { class: true });
			var div4_nodes = children(div4);
			div0 = claim_element(div4_nodes, "DIV", { class: true });
			var div0_nodes = children(div0);
			h3 = claim_element(div0_nodes, "H3", { class: true });
			var h3_nodes = children(h3);
			t0 = claim_text(h3_nodes, "🧊 Icebreaker Activity");
			h3_nodes.forEach(detach);
			t1 = claim_space(div0_nodes);
			span = claim_element(div0_nodes, "SPAN", { class: true });
			var span_nodes = children(span);
			t2 = claim_text(span_nodes, "⏱️ ");
			t3 = claim_text(span_nodes, t3_value);
			span_nodes.forEach(detach);
			div0_nodes.forEach(detach);
			t4 = claim_space(div4_nodes);
			div3 = claim_element(div4_nodes, "DIV", { class: true });
			var div3_nodes = children(div3);
			h4 = claim_element(div3_nodes, "H4", { class: true });
			var h4_nodes = children(h4);
			t5 = claim_text(h4_nodes, t5_value);
			h4_nodes.forEach(detach);
			t6 = claim_space(div3_nodes);
			p = claim_element(div3_nodes, "P", { class: true });
			var p_nodes = children(p);
			t7 = claim_text(p_nodes, t7_value);
			p_nodes.forEach(detach);
			t8 = claim_space(div3_nodes);
			div1 = claim_element(div3_nodes, "DIV", { class: true });
			var div1_nodes = children(div1);
			strong = claim_element(div1_nodes, "STRONG", { class: true });
			var strong_nodes = children(strong);
			t9 = claim_text(strong_nodes, "Materials needed:");
			strong_nodes.forEach(detach);
			t10 = claim_space(div1_nodes);
			ul = claim_element(div1_nodes, "UL", { class: true });
			var ul_nodes = children(ul);

			for (let i = 0; i < each_blocks_1.length; i += 1) {
				each_blocks_1[i].l(ul_nodes);
			}

			ul_nodes.forEach(detach);
			div1_nodes.forEach(detach);
			t11 = claim_space(div3_nodes);
			div2 = claim_element(div3_nodes, "DIV", { class: true });
			var div2_nodes = children(div2);
			h5 = claim_element(div2_nodes, "H5", { class: true });
			var h5_nodes = children(h5);
			t12 = claim_text(h5_nodes, "Age Group Adaptations:");
			h5_nodes.forEach(detach);
			t13 = claim_space(div2_nodes);

			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].l(div2_nodes);
			}

			div2_nodes.forEach(detach);
			div3_nodes.forEach(detach);
			div4_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(h3, "class", "svelte-18lncot");
			attr(span, "class", "activity-duration svelte-18lncot");
			attr(div0, "class", "activity-header svelte-18lncot");
			attr(h4, "class", "svelte-18lncot");
			attr(p, "class", "activity-description svelte-18lncot");
			attr(strong, "class", "svelte-18lncot");
			attr(ul, "class", "svelte-18lncot");
			attr(div1, "class", "activity-materials svelte-18lncot");
			attr(h5, "class", "svelte-18lncot");
			attr(div2, "class", "age-adaptations svelte-18lncot");
			attr(div3, "class", "activity-content svelte-18lncot");
			attr(div4, "class", "activity-card icebreaker svelte-18lncot");
		},
		m(target, anchor) {
			insert_hydration(target, div4, anchor);
			append_hydration(div4, div0);
			append_hydration(div0, h3);
			append_hydration(h3, t0);
			append_hydration(div0, t1);
			append_hydration(div0, span);
			append_hydration(span, t2);
			append_hydration(span, t3);
			append_hydration(div4, t4);
			append_hydration(div4, div3);
			append_hydration(div3, h4);
			append_hydration(h4, t5);
			append_hydration(div3, t6);
			append_hydration(div3, p);
			append_hydration(p, t7);
			append_hydration(div3, t8);
			append_hydration(div3, div1);
			append_hydration(div1, strong);
			append_hydration(strong, t9);
			append_hydration(div1, t10);
			append_hydration(div1, ul);

			for (let i = 0; i < each_blocks_1.length; i += 1) {
				if (each_blocks_1[i]) {
					each_blocks_1[i].m(ul, null);
				}
			}

			append_hydration(div3, t11);
			append_hydration(div3, div2);
			append_hydration(div2, h5);
			append_hydration(h5, t12);
			append_hydration(div2, t13);

			for (let i = 0; i < each_blocks.length; i += 1) {
				if (each_blocks[i]) {
					each_blocks[i].m(div2, null);
				}
			}
		},
		p(ctx, dirty) {
			if (dirty[0] & /*currentWeek*/ 64 && t3_value !== (t3_value = /*currentWeek*/ ctx[6].activities.icebreaker.duration + "")) set_data(t3, t3_value);
			if (dirty[0] & /*currentWeek*/ 64 && t5_value !== (t5_value = /*currentWeek*/ ctx[6].activities.icebreaker.title + "")) set_data(t5, t5_value);
			if (dirty[0] & /*currentWeek*/ 64 && t7_value !== (t7_value = /*currentWeek*/ ctx[6].activities.icebreaker.description + "")) set_data(t7, t7_value);

			if (dirty[0] & /*currentWeek*/ 64) {
				each_value_9 = /*currentWeek*/ ctx[6].activities.icebreaker.materials;
				let i;

				for (i = 0; i < each_value_9.length; i += 1) {
					const child_ctx = get_each_context_9(ctx, each_value_9, i);

					if (each_blocks_1[i]) {
						each_blocks_1[i].p(child_ctx, dirty);
					} else {
						each_blocks_1[i] = create_each_block_9(child_ctx);
						each_blocks_1[i].c();
						each_blocks_1[i].m(ul, null);
					}
				}

				for (; i < each_blocks_1.length; i += 1) {
					each_blocks_1[i].d(1);
				}

				each_blocks_1.length = each_value_9.length;
			}

			if (dirty[0] & /*currentWeek*/ 64) {
				each_value_8 = Object.entries(/*currentWeek*/ ctx[6].activities.icebreaker.ageAdaptations);
				let i;

				for (i = 0; i < each_value_8.length; i += 1) {
					const child_ctx = get_each_context_8(ctx, each_value_8, i);

					if (each_blocks[i]) {
						each_blocks[i].p(child_ctx, dirty);
					} else {
						each_blocks[i] = create_each_block_8(child_ctx);
						each_blocks[i].c();
						each_blocks[i].m(div2, null);
					}
				}

				for (; i < each_blocks.length; i += 1) {
					each_blocks[i].d(1);
				}

				each_blocks.length = each_value_8.length;
			}
		},
		d(detaching) {
			if (detaching) detach(div4);
			destroy_each(each_blocks_1, detaching);
			destroy_each(each_blocks, detaching);
		}
	};
}

// (1324:18) {#each currentWeek.activities.icebreaker.materials as material}
function create_each_block_9(ctx) {
	let li;
	let t_value = /*material*/ ctx[32] + "";
	let t;

	return {
		c() {
			li = element("li");
			t = text(t_value);
			this.h();
		},
		l(nodes) {
			li = claim_element(nodes, "LI", { class: true });
			var li_nodes = children(li);
			t = claim_text(li_nodes, t_value);
			li_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(li, "class", "svelte-18lncot");
		},
		m(target, anchor) {
			insert_hydration(target, li, anchor);
			append_hydration(li, t);
		},
		p(ctx, dirty) {
			if (dirty[0] & /*currentWeek*/ 64 && t_value !== (t_value = /*material*/ ctx[32] + "")) set_data(t, t_value);
		},
		d(detaching) {
			if (detaching) detach(li);
		}
	};
}

// (1337:51) 
function create_if_block_22(ctx) {
	let t;

	return {
		c() {
			t = text("✨ Group C (14-17 females):");
		},
		l(nodes) {
			t = claim_text(nodes, "✨ Group C (14-17 females):");
		},
		m(target, anchor) {
			insert_hydration(target, t, anchor);
		},
		d(detaching) {
			if (detaching) detach(t);
		}
	};
}

// (1336:51) 
function create_if_block_21(ctx) {
	let t;

	return {
		c() {
			t = text("⚡ Group B (14-17 males):");
		},
		l(nodes) {
			t = claim_text(nodes, "⚡ Group B (14-17 males):");
		},
		m(target, anchor) {
			insert_hydration(target, t, anchor);
		},
		d(detaching) {
			if (detaching) detach(t);
		}
	};
}

// (1335:22) {#if group === 'groupA'}
function create_if_block_20(ctx) {
	let t;

	return {
		c() {
			t = text("🎮 Group A (10-13):");
		},
		l(nodes) {
			t = claim_text(nodes, "🎮 Group A (10-13):");
		},
		m(target, anchor) {
			insert_hydration(target, t, anchor);
		},
		d(detaching) {
			if (detaching) detach(t);
		}
	};
}

// (1332:16) {#each Object.entries(currentWeek.activities.icebreaker.ageAdaptations) as [group, adaptation]}
function create_each_block_8(ctx) {
	let div;
	let strong;
	let t0;
	let span;
	let t1_value = /*adaptation*/ ctx[48] + "";
	let t1;
	let t2;

	function select_block_type_3(ctx, dirty) {
		if (/*group*/ ctx[47] === 'groupA') return create_if_block_20;
		if (/*group*/ ctx[47] === 'groupB') return create_if_block_21;
		if (/*group*/ ctx[47] === 'groupC') return create_if_block_22;
	}

	let current_block_type = select_block_type_3(ctx);
	let if_block = current_block_type && current_block_type(ctx);

	return {
		c() {
			div = element("div");
			strong = element("strong");
			if (if_block) if_block.c();
			t0 = space();
			span = element("span");
			t1 = text(t1_value);
			t2 = space();
			this.h();
		},
		l(nodes) {
			div = claim_element(nodes, "DIV", { class: true });
			var div_nodes = children(div);
			strong = claim_element(div_nodes, "STRONG", { class: true });
			var strong_nodes = children(strong);
			if (if_block) if_block.l(strong_nodes);
			strong_nodes.forEach(detach);
			t0 = claim_space(div_nodes);
			span = claim_element(div_nodes, "SPAN", { class: true });
			var span_nodes = children(span);
			t1 = claim_text(span_nodes, t1_value);
			span_nodes.forEach(detach);
			t2 = claim_space(div_nodes);
			div_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(strong, "class", "svelte-18lncot");
			attr(span, "class", "svelte-18lncot");
			attr(div, "class", "adaptation-item svelte-18lncot");
		},
		m(target, anchor) {
			insert_hydration(target, div, anchor);
			append_hydration(div, strong);
			if (if_block) if_block.m(strong, null);
			append_hydration(div, t0);
			append_hydration(div, span);
			append_hydration(span, t1);
			append_hydration(div, t2);
		},
		p(ctx, dirty) {
			if (current_block_type !== (current_block_type = select_block_type_3(ctx))) {
				if (if_block) if_block.d(1);
				if_block = current_block_type && current_block_type(ctx);

				if (if_block) {
					if_block.c();
					if_block.m(strong, null);
				}
			}

			if (dirty[0] & /*currentWeek*/ 64 && t1_value !== (t1_value = /*adaptation*/ ctx[48] + "")) set_data(t1, t1_value);
		},
		d(detaching) {
			if (detaching) detach(div);

			if (if_block) {
				if_block.d();
			}
		}
	};
}

// (1349:8) {#if currentWeek.activities.mindGame}
function create_if_block_15(ctx) {
	let div4;
	let div0;
	let h3;
	let t0;
	let t1;
	let span;
	let t2;
	let t3_value = /*currentWeek*/ ctx[6].activities.mindGame.duration + "";
	let t3;
	let t4;
	let div3;
	let h4;
	let t5_value = /*currentWeek*/ ctx[6].activities.mindGame.title + "";
	let t5;
	let t6;
	let p;
	let t7_value = /*currentWeek*/ ctx[6].activities.mindGame.description + "";
	let t7;
	let t8;
	let div1;
	let strong;
	let t9;
	let t10;
	let ul;
	let t11;
	let div2;
	let h5;
	let t12;
	let t13;
	let each_value_7 = /*currentWeek*/ ctx[6].activities.mindGame.materials;
	let each_blocks_1 = [];

	for (let i = 0; i < each_value_7.length; i += 1) {
		each_blocks_1[i] = create_each_block_7(get_each_context_7(ctx, each_value_7, i));
	}

	let each_value_6 = Object.entries(/*currentWeek*/ ctx[6].activities.mindGame.ageAdaptations);
	let each_blocks = [];

	for (let i = 0; i < each_value_6.length; i += 1) {
		each_blocks[i] = create_each_block_6(get_each_context_6(ctx, each_value_6, i));
	}

	return {
		c() {
			div4 = element("div");
			div0 = element("div");
			h3 = element("h3");
			t0 = text("🧠 Mind Game Activity");
			t1 = space();
			span = element("span");
			t2 = text("⏱️ ");
			t3 = text(t3_value);
			t4 = space();
			div3 = element("div");
			h4 = element("h4");
			t5 = text(t5_value);
			t6 = space();
			p = element("p");
			t7 = text(t7_value);
			t8 = space();
			div1 = element("div");
			strong = element("strong");
			t9 = text("Materials needed:");
			t10 = space();
			ul = element("ul");

			for (let i = 0; i < each_blocks_1.length; i += 1) {
				each_blocks_1[i].c();
			}

			t11 = space();
			div2 = element("div");
			h5 = element("h5");
			t12 = text("Age Group Adaptations:");
			t13 = space();

			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].c();
			}

			this.h();
		},
		l(nodes) {
			div4 = claim_element(nodes, "DIV", { class: true });
			var div4_nodes = children(div4);
			div0 = claim_element(div4_nodes, "DIV", { class: true });
			var div0_nodes = children(div0);
			h3 = claim_element(div0_nodes, "H3", { class: true });
			var h3_nodes = children(h3);
			t0 = claim_text(h3_nodes, "🧠 Mind Game Activity");
			h3_nodes.forEach(detach);
			t1 = claim_space(div0_nodes);
			span = claim_element(div0_nodes, "SPAN", { class: true });
			var span_nodes = children(span);
			t2 = claim_text(span_nodes, "⏱️ ");
			t3 = claim_text(span_nodes, t3_value);
			span_nodes.forEach(detach);
			div0_nodes.forEach(detach);
			t4 = claim_space(div4_nodes);
			div3 = claim_element(div4_nodes, "DIV", { class: true });
			var div3_nodes = children(div3);
			h4 = claim_element(div3_nodes, "H4", { class: true });
			var h4_nodes = children(h4);
			t5 = claim_text(h4_nodes, t5_value);
			h4_nodes.forEach(detach);
			t6 = claim_space(div3_nodes);
			p = claim_element(div3_nodes, "P", { class: true });
			var p_nodes = children(p);
			t7 = claim_text(p_nodes, t7_value);
			p_nodes.forEach(detach);
			t8 = claim_space(div3_nodes);
			div1 = claim_element(div3_nodes, "DIV", { class: true });
			var div1_nodes = children(div1);
			strong = claim_element(div1_nodes, "STRONG", { class: true });
			var strong_nodes = children(strong);
			t9 = claim_text(strong_nodes, "Materials needed:");
			strong_nodes.forEach(detach);
			t10 = claim_space(div1_nodes);
			ul = claim_element(div1_nodes, "UL", { class: true });
			var ul_nodes = children(ul);

			for (let i = 0; i < each_blocks_1.length; i += 1) {
				each_blocks_1[i].l(ul_nodes);
			}

			ul_nodes.forEach(detach);
			div1_nodes.forEach(detach);
			t11 = claim_space(div3_nodes);
			div2 = claim_element(div3_nodes, "DIV", { class: true });
			var div2_nodes = children(div2);
			h5 = claim_element(div2_nodes, "H5", { class: true });
			var h5_nodes = children(h5);
			t12 = claim_text(h5_nodes, "Age Group Adaptations:");
			h5_nodes.forEach(detach);
			t13 = claim_space(div2_nodes);

			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].l(div2_nodes);
			}

			div2_nodes.forEach(detach);
			div3_nodes.forEach(detach);
			div4_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(h3, "class", "svelte-18lncot");
			attr(span, "class", "activity-duration svelte-18lncot");
			attr(div0, "class", "activity-header svelte-18lncot");
			attr(h4, "class", "svelte-18lncot");
			attr(p, "class", "activity-description svelte-18lncot");
			attr(strong, "class", "svelte-18lncot");
			attr(ul, "class", "svelte-18lncot");
			attr(div1, "class", "activity-materials svelte-18lncot");
			attr(h5, "class", "svelte-18lncot");
			attr(div2, "class", "age-adaptations svelte-18lncot");
			attr(div3, "class", "activity-content svelte-18lncot");
			attr(div4, "class", "activity-card mind-game svelte-18lncot");
		},
		m(target, anchor) {
			insert_hydration(target, div4, anchor);
			append_hydration(div4, div0);
			append_hydration(div0, h3);
			append_hydration(h3, t0);
			append_hydration(div0, t1);
			append_hydration(div0, span);
			append_hydration(span, t2);
			append_hydration(span, t3);
			append_hydration(div4, t4);
			append_hydration(div4, div3);
			append_hydration(div3, h4);
			append_hydration(h4, t5);
			append_hydration(div3, t6);
			append_hydration(div3, p);
			append_hydration(p, t7);
			append_hydration(div3, t8);
			append_hydration(div3, div1);
			append_hydration(div1, strong);
			append_hydration(strong, t9);
			append_hydration(div1, t10);
			append_hydration(div1, ul);

			for (let i = 0; i < each_blocks_1.length; i += 1) {
				if (each_blocks_1[i]) {
					each_blocks_1[i].m(ul, null);
				}
			}

			append_hydration(div3, t11);
			append_hydration(div3, div2);
			append_hydration(div2, h5);
			append_hydration(h5, t12);
			append_hydration(div2, t13);

			for (let i = 0; i < each_blocks.length; i += 1) {
				if (each_blocks[i]) {
					each_blocks[i].m(div2, null);
				}
			}
		},
		p(ctx, dirty) {
			if (dirty[0] & /*currentWeek*/ 64 && t3_value !== (t3_value = /*currentWeek*/ ctx[6].activities.mindGame.duration + "")) set_data(t3, t3_value);
			if (dirty[0] & /*currentWeek*/ 64 && t5_value !== (t5_value = /*currentWeek*/ ctx[6].activities.mindGame.title + "")) set_data(t5, t5_value);
			if (dirty[0] & /*currentWeek*/ 64 && t7_value !== (t7_value = /*currentWeek*/ ctx[6].activities.mindGame.description + "")) set_data(t7, t7_value);

			if (dirty[0] & /*currentWeek*/ 64) {
				each_value_7 = /*currentWeek*/ ctx[6].activities.mindGame.materials;
				let i;

				for (i = 0; i < each_value_7.length; i += 1) {
					const child_ctx = get_each_context_7(ctx, each_value_7, i);

					if (each_blocks_1[i]) {
						each_blocks_1[i].p(child_ctx, dirty);
					} else {
						each_blocks_1[i] = create_each_block_7(child_ctx);
						each_blocks_1[i].c();
						each_blocks_1[i].m(ul, null);
					}
				}

				for (; i < each_blocks_1.length; i += 1) {
					each_blocks_1[i].d(1);
				}

				each_blocks_1.length = each_value_7.length;
			}

			if (dirty[0] & /*currentWeek*/ 64) {
				each_value_6 = Object.entries(/*currentWeek*/ ctx[6].activities.mindGame.ageAdaptations);
				let i;

				for (i = 0; i < each_value_6.length; i += 1) {
					const child_ctx = get_each_context_6(ctx, each_value_6, i);

					if (each_blocks[i]) {
						each_blocks[i].p(child_ctx, dirty);
					} else {
						each_blocks[i] = create_each_block_6(child_ctx);
						each_blocks[i].c();
						each_blocks[i].m(div2, null);
					}
				}

				for (; i < each_blocks.length; i += 1) {
					each_blocks[i].d(1);
				}

				each_blocks.length = each_value_6.length;
			}
		},
		d(detaching) {
			if (detaching) detach(div4);
			destroy_each(each_blocks_1, detaching);
			destroy_each(each_blocks, detaching);
		}
	};
}

// (1362:18) {#each currentWeek.activities.mindGame.materials as material}
function create_each_block_7(ctx) {
	let li;
	let t_value = /*material*/ ctx[32] + "";
	let t;

	return {
		c() {
			li = element("li");
			t = text(t_value);
			this.h();
		},
		l(nodes) {
			li = claim_element(nodes, "LI", { class: true });
			var li_nodes = children(li);
			t = claim_text(li_nodes, t_value);
			li_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(li, "class", "svelte-18lncot");
		},
		m(target, anchor) {
			insert_hydration(target, li, anchor);
			append_hydration(li, t);
		},
		p(ctx, dirty) {
			if (dirty[0] & /*currentWeek*/ 64 && t_value !== (t_value = /*material*/ ctx[32] + "")) set_data(t, t_value);
		},
		d(detaching) {
			if (detaching) detach(li);
		}
	};
}

// (1375:51) 
function create_if_block_18(ctx) {
	let t;

	return {
		c() {
			t = text("✨ Group C (14-17 females):");
		},
		l(nodes) {
			t = claim_text(nodes, "✨ Group C (14-17 females):");
		},
		m(target, anchor) {
			insert_hydration(target, t, anchor);
		},
		d(detaching) {
			if (detaching) detach(t);
		}
	};
}

// (1374:51) 
function create_if_block_17(ctx) {
	let t;

	return {
		c() {
			t = text("⚡ Group B (14-17 males):");
		},
		l(nodes) {
			t = claim_text(nodes, "⚡ Group B (14-17 males):");
		},
		m(target, anchor) {
			insert_hydration(target, t, anchor);
		},
		d(detaching) {
			if (detaching) detach(t);
		}
	};
}

// (1373:22) {#if group === 'groupA'}
function create_if_block_16(ctx) {
	let t;

	return {
		c() {
			t = text("🎮 Group A (10-13):");
		},
		l(nodes) {
			t = claim_text(nodes, "🎮 Group A (10-13):");
		},
		m(target, anchor) {
			insert_hydration(target, t, anchor);
		},
		d(detaching) {
			if (detaching) detach(t);
		}
	};
}

// (1370:16) {#each Object.entries(currentWeek.activities.mindGame.ageAdaptations) as [group, adaptation]}
function create_each_block_6(ctx) {
	let div;
	let strong;
	let t0;
	let span;
	let t1_value = /*adaptation*/ ctx[48] + "";
	let t1;
	let t2;

	function select_block_type_4(ctx, dirty) {
		if (/*group*/ ctx[47] === 'groupA') return create_if_block_16;
		if (/*group*/ ctx[47] === 'groupB') return create_if_block_17;
		if (/*group*/ ctx[47] === 'groupC') return create_if_block_18;
	}

	let current_block_type = select_block_type_4(ctx);
	let if_block = current_block_type && current_block_type(ctx);

	return {
		c() {
			div = element("div");
			strong = element("strong");
			if (if_block) if_block.c();
			t0 = space();
			span = element("span");
			t1 = text(t1_value);
			t2 = space();
			this.h();
		},
		l(nodes) {
			div = claim_element(nodes, "DIV", { class: true });
			var div_nodes = children(div);
			strong = claim_element(div_nodes, "STRONG", { class: true });
			var strong_nodes = children(strong);
			if (if_block) if_block.l(strong_nodes);
			strong_nodes.forEach(detach);
			t0 = claim_space(div_nodes);
			span = claim_element(div_nodes, "SPAN", { class: true });
			var span_nodes = children(span);
			t1 = claim_text(span_nodes, t1_value);
			span_nodes.forEach(detach);
			t2 = claim_space(div_nodes);
			div_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(strong, "class", "svelte-18lncot");
			attr(span, "class", "svelte-18lncot");
			attr(div, "class", "adaptation-item svelte-18lncot");
		},
		m(target, anchor) {
			insert_hydration(target, div, anchor);
			append_hydration(div, strong);
			if (if_block) if_block.m(strong, null);
			append_hydration(div, t0);
			append_hydration(div, span);
			append_hydration(span, t1);
			append_hydration(div, t2);
		},
		p(ctx, dirty) {
			if (current_block_type !== (current_block_type = select_block_type_4(ctx))) {
				if (if_block) if_block.d(1);
				if_block = current_block_type && current_block_type(ctx);

				if (if_block) {
					if_block.c();
					if_block.m(strong, null);
				}
			}

			if (dirty[0] & /*currentWeek*/ 64 && t1_value !== (t1_value = /*adaptation*/ ctx[48] + "")) set_data(t1, t1_value);
		},
		d(detaching) {
			if (detaching) detach(div);

			if (if_block) {
				if_block.d();
			}
		}
	};
}

// (1219:10) {#if expandedSections.has('preparation')}
function create_if_block_13(ctx) {
	let div;
	let ul;
	let each_value_5 = /*currentWeek*/ ctx[6].teacherNotes.preparation;
	let each_blocks = [];

	for (let i = 0; i < each_value_5.length; i += 1) {
		each_blocks[i] = create_each_block_5(get_each_context_5(ctx, each_value_5, i));
	}

	return {
		c() {
			div = element("div");
			ul = element("ul");

			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].c();
			}

			this.h();
		},
		l(nodes) {
			div = claim_element(nodes, "DIV", { class: true });
			var div_nodes = children(div);
			ul = claim_element(div_nodes, "UL", { class: true });
			var ul_nodes = children(ul);

			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].l(ul_nodes);
			}

			ul_nodes.forEach(detach);
			div_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(ul, "class", "preparation-list svelte-18lncot");
			attr(div, "class", "section-content svelte-18lncot");
		},
		m(target, anchor) {
			insert_hydration(target, div, anchor);
			append_hydration(div, ul);

			for (let i = 0; i < each_blocks.length; i += 1) {
				if (each_blocks[i]) {
					each_blocks[i].m(ul, null);
				}
			}
		},
		p(ctx, dirty) {
			if (dirty[0] & /*currentWeek*/ 64) {
				each_value_5 = /*currentWeek*/ ctx[6].teacherNotes.preparation;
				let i;

				for (i = 0; i < each_value_5.length; i += 1) {
					const child_ctx = get_each_context_5(ctx, each_value_5, i);

					if (each_blocks[i]) {
						each_blocks[i].p(child_ctx, dirty);
					} else {
						each_blocks[i] = create_each_block_5(child_ctx);
						each_blocks[i].c();
						each_blocks[i].m(ul, null);
					}
				}

				for (; i < each_blocks.length; i += 1) {
					each_blocks[i].d(1);
				}

				each_blocks.length = each_value_5.length;
			}
		},
		d(detaching) {
			if (detaching) detach(div);
			destroy_each(each_blocks, detaching);
		}
	};
}

// (1222:16) {#each currentWeek.teacherNotes.preparation as item}
function create_each_block_5(ctx) {
	let li;
	let t_value = /*item*/ ctx[44] + "";
	let t;

	return {
		c() {
			li = element("li");
			t = text(t_value);
			this.h();
		},
		l(nodes) {
			li = claim_element(nodes, "LI", { class: true });
			var li_nodes = children(li);
			t = claim_text(li_nodes, t_value);
			li_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(li, "class", "svelte-18lncot");
		},
		m(target, anchor) {
			insert_hydration(target, li, anchor);
			append_hydration(li, t);
		},
		p(ctx, dirty) {
			if (dirty[0] & /*currentWeek*/ 64 && t_value !== (t_value = /*item*/ ctx[44] + "")) set_data(t, t_value);
		},
		d(detaching) {
			if (detaching) detach(li);
		}
	};
}

// (1240:10) {#if expandedSections.has('adaptations')}
function create_if_block_12(ctx) {
	let div4;
	let div3;
	let div0;
	let h40;
	let t0;
	let t1;
	let p0;
	let t2_value = /*currentWeek*/ ctx[6].teacherNotes.ageGroupAdaptations.groupA + "";
	let t2;
	let t3;
	let div1;
	let h41;
	let t4;
	let t5;
	let p1;
	let t6_value = /*currentWeek*/ ctx[6].teacherNotes.ageGroupAdaptations.groupB + "";
	let t6;
	let t7;
	let div2;
	let h42;
	let t8;
	let t9;
	let p2;
	let t10_value = /*currentWeek*/ ctx[6].teacherNotes.ageGroupAdaptations.groupC + "";
	let t10;

	return {
		c() {
			div4 = element("div");
			div3 = element("div");
			div0 = element("div");
			h40 = element("h4");
			t0 = text("🎮 Group A (10-13 years)");
			t1 = space();
			p0 = element("p");
			t2 = text(t2_value);
			t3 = space();
			div1 = element("div");
			h41 = element("h4");
			t4 = text("⚡ Group B (14-17 males)");
			t5 = space();
			p1 = element("p");
			t6 = text(t6_value);
			t7 = space();
			div2 = element("div");
			h42 = element("h4");
			t8 = text("✨ Group C (14-17 females)");
			t9 = space();
			p2 = element("p");
			t10 = text(t10_value);
			this.h();
		},
		l(nodes) {
			div4 = claim_element(nodes, "DIV", { class: true });
			var div4_nodes = children(div4);
			div3 = claim_element(div4_nodes, "DIV", { class: true });
			var div3_nodes = children(div3);
			div0 = claim_element(div3_nodes, "DIV", { class: true });
			var div0_nodes = children(div0);
			h40 = claim_element(div0_nodes, "H4", { class: true });
			var h40_nodes = children(h40);
			t0 = claim_text(h40_nodes, "🎮 Group A (10-13 years)");
			h40_nodes.forEach(detach);
			t1 = claim_space(div0_nodes);
			p0 = claim_element(div0_nodes, "P", {});
			var p0_nodes = children(p0);
			t2 = claim_text(p0_nodes, t2_value);
			p0_nodes.forEach(detach);
			div0_nodes.forEach(detach);
			t3 = claim_space(div3_nodes);
			div1 = claim_element(div3_nodes, "DIV", { class: true });
			var div1_nodes = children(div1);
			h41 = claim_element(div1_nodes, "H4", { class: true });
			var h41_nodes = children(h41);
			t4 = claim_text(h41_nodes, "⚡ Group B (14-17 males)");
			h41_nodes.forEach(detach);
			t5 = claim_space(div1_nodes);
			p1 = claim_element(div1_nodes, "P", {});
			var p1_nodes = children(p1);
			t6 = claim_text(p1_nodes, t6_value);
			p1_nodes.forEach(detach);
			div1_nodes.forEach(detach);
			t7 = claim_space(div3_nodes);
			div2 = claim_element(div3_nodes, "DIV", { class: true });
			var div2_nodes = children(div2);
			h42 = claim_element(div2_nodes, "H4", { class: true });
			var h42_nodes = children(h42);
			t8 = claim_text(h42_nodes, "✨ Group C (14-17 females)");
			h42_nodes.forEach(detach);
			t9 = claim_space(div2_nodes);
			p2 = claim_element(div2_nodes, "P", {});
			var p2_nodes = children(p2);
			t10 = claim_text(p2_nodes, t10_value);
			p2_nodes.forEach(detach);
			div2_nodes.forEach(detach);
			div3_nodes.forEach(detach);
			div4_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(h40, "class", "svelte-18lncot");
			attr(div0, "class", "adaptation-card group-a svelte-18lncot");
			attr(h41, "class", "svelte-18lncot");
			attr(div1, "class", "adaptation-card group-b svelte-18lncot");
			attr(h42, "class", "svelte-18lncot");
			attr(div2, "class", "adaptation-card group-c svelte-18lncot");
			attr(div3, "class", "adaptations-grid svelte-18lncot");
			attr(div4, "class", "section-content svelte-18lncot");
		},
		m(target, anchor) {
			insert_hydration(target, div4, anchor);
			append_hydration(div4, div3);
			append_hydration(div3, div0);
			append_hydration(div0, h40);
			append_hydration(h40, t0);
			append_hydration(div0, t1);
			append_hydration(div0, p0);
			append_hydration(p0, t2);
			append_hydration(div3, t3);
			append_hydration(div3, div1);
			append_hydration(div1, h41);
			append_hydration(h41, t4);
			append_hydration(div1, t5);
			append_hydration(div1, p1);
			append_hydration(p1, t6);
			append_hydration(div3, t7);
			append_hydration(div3, div2);
			append_hydration(div2, h42);
			append_hydration(h42, t8);
			append_hydration(div2, t9);
			append_hydration(div2, p2);
			append_hydration(p2, t10);
		},
		p(ctx, dirty) {
			if (dirty[0] & /*currentWeek*/ 64 && t2_value !== (t2_value = /*currentWeek*/ ctx[6].teacherNotes.ageGroupAdaptations.groupA + "")) set_data(t2, t2_value);
			if (dirty[0] & /*currentWeek*/ 64 && t6_value !== (t6_value = /*currentWeek*/ ctx[6].teacherNotes.ageGroupAdaptations.groupB + "")) set_data(t6, t6_value);
			if (dirty[0] & /*currentWeek*/ 64 && t10_value !== (t10_value = /*currentWeek*/ ctx[6].teacherNotes.ageGroupAdaptations.groupC + "")) set_data(t10, t10_value);
		},
		d(detaching) {
			if (detaching) detach(div4);
		}
	};
}

// (1261:8) {#if currentWeek.teacherNotes.commonChallenges}
function create_if_block_10(ctx) {
	let div;
	let button;
	let h3;
	let t0;
	let t1;
	let span;
	let t2;
	let span_class_value;
	let t3;
	let show_if = /*expandedSections*/ ctx[4].has('challenges');
	let mounted;
	let dispose;
	let if_block = show_if && create_if_block_11(ctx);

	return {
		c() {
			div = element("div");
			button = element("button");
			h3 = element("h3");
			t0 = text("Common Challenges & Solutions");
			t1 = space();
			span = element("span");
			t2 = text("▼");
			t3 = space();
			if (if_block) if_block.c();
			this.h();
		},
		l(nodes) {
			div = claim_element(nodes, "DIV", { class: true });
			var div_nodes = children(div);
			button = claim_element(div_nodes, "BUTTON", { class: true });
			var button_nodes = children(button);
			h3 = claim_element(button_nodes, "H3", { class: true });
			var h3_nodes = children(h3);
			t0 = claim_text(h3_nodes, "Common Challenges & Solutions");
			h3_nodes.forEach(detach);
			t1 = claim_space(button_nodes);
			span = claim_element(button_nodes, "SPAN", { class: true });
			var span_nodes = children(span);
			t2 = claim_text(span_nodes, "▼");
			span_nodes.forEach(detach);
			button_nodes.forEach(detach);
			t3 = claim_space(div_nodes);
			if (if_block) if_block.l(div_nodes);
			div_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(h3, "class", "svelte-18lncot");

			attr(span, "class", span_class_value = "expand-icon " + (/*expandedSections*/ ctx[4].has('challenges')
			? 'expanded'
			: '') + " svelte-18lncot");

			attr(button, "class", "section-header svelte-18lncot");
			attr(div, "class", "content-section svelte-18lncot");
		},
		m(target, anchor) {
			insert_hydration(target, div, anchor);
			append_hydration(div, button);
			append_hydration(button, h3);
			append_hydration(h3, t0);
			append_hydration(button, t1);
			append_hydration(button, span);
			append_hydration(span, t2);
			append_hydration(div, t3);
			if (if_block) if_block.m(div, null);

			if (!mounted) {
				dispose = listen(button, "click", /*click_handler_13*/ ctx[26]);
				mounted = true;
			}
		},
		p(ctx, dirty) {
			if (dirty[0] & /*expandedSections*/ 16 && span_class_value !== (span_class_value = "expand-icon " + (/*expandedSections*/ ctx[4].has('challenges')
			? 'expanded'
			: '') + " svelte-18lncot")) {
				attr(span, "class", span_class_value);
			}

			if (dirty[0] & /*expandedSections*/ 16) show_if = /*expandedSections*/ ctx[4].has('challenges');

			if (show_if) {
				if (if_block) {
					if_block.p(ctx, dirty);
				} else {
					if_block = create_if_block_11(ctx);
					if_block.c();
					if_block.m(div, null);
				}
			} else if (if_block) {
				if_block.d(1);
				if_block = null;
			}
		},
		d(detaching) {
			if (detaching) detach(div);
			if (if_block) if_block.d();
			mounted = false;
			dispose();
		}
	};
}

// (1271:12) {#if expandedSections.has('challenges')}
function create_if_block_11(ctx) {
	let div;
	let ul;
	let each_value_4 = /*currentWeek*/ ctx[6].teacherNotes.commonChallenges;
	let each_blocks = [];

	for (let i = 0; i < each_value_4.length; i += 1) {
		each_blocks[i] = create_each_block_4(get_each_context_4(ctx, each_value_4, i));
	}

	return {
		c() {
			div = element("div");
			ul = element("ul");

			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].c();
			}

			this.h();
		},
		l(nodes) {
			div = claim_element(nodes, "DIV", { class: true });
			var div_nodes = children(div);
			ul = claim_element(div_nodes, "UL", { class: true });
			var ul_nodes = children(ul);

			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].l(ul_nodes);
			}

			ul_nodes.forEach(detach);
			div_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(ul, "class", "challenges-list svelte-18lncot");
			attr(div, "class", "section-content svelte-18lncot");
		},
		m(target, anchor) {
			insert_hydration(target, div, anchor);
			append_hydration(div, ul);

			for (let i = 0; i < each_blocks.length; i += 1) {
				if (each_blocks[i]) {
					each_blocks[i].m(ul, null);
				}
			}
		},
		p(ctx, dirty) {
			if (dirty[0] & /*currentWeek*/ 64) {
				each_value_4 = /*currentWeek*/ ctx[6].teacherNotes.commonChallenges;
				let i;

				for (i = 0; i < each_value_4.length; i += 1) {
					const child_ctx = get_each_context_4(ctx, each_value_4, i);

					if (each_blocks[i]) {
						each_blocks[i].p(child_ctx, dirty);
					} else {
						each_blocks[i] = create_each_block_4(child_ctx);
						each_blocks[i].c();
						each_blocks[i].m(ul, null);
					}
				}

				for (; i < each_blocks.length; i += 1) {
					each_blocks[i].d(1);
				}

				each_blocks.length = each_value_4.length;
			}
		},
		d(detaching) {
			if (detaching) detach(div);
			destroy_each(each_blocks, detaching);
		}
	};
}

// (1274:18) {#each currentWeek.teacherNotes.commonChallenges as challenge}
function create_each_block_4(ctx) {
	let li;
	let t_value = /*challenge*/ ctx[41] + "";
	let t;

	return {
		c() {
			li = element("li");
			t = text(t_value);
			this.h();
		},
		l(nodes) {
			li = claim_element(nodes, "LI", { class: true });
			var li_nodes = children(li);
			t = claim_text(li_nodes, t_value);
			li_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(li, "class", "svelte-18lncot");
		},
		m(target, anchor) {
			insert_hydration(target, li, anchor);
			append_hydration(li, t);
		},
		p(ctx, dirty) {
			if (dirty[0] & /*currentWeek*/ 64 && t_value !== (t_value = /*challenge*/ ctx[41] + "")) set_data(t, t_value);
		},
		d(detaching) {
			if (detaching) detach(li);
		}
	};
}

// (1284:8) {#if currentWeek.teacherNotes.extensions}
function create_if_block_8(ctx) {
	let div;
	let button;
	let h3;
	let t0;
	let t1;
	let span;
	let t2;
	let span_class_value;
	let t3;
	let show_if = /*expandedSections*/ ctx[4].has('extensions');
	let mounted;
	let dispose;
	let if_block = show_if && create_if_block_9(ctx);

	return {
		c() {
			div = element("div");
			button = element("button");
			h3 = element("h3");
			t0 = text("Extension Activities");
			t1 = space();
			span = element("span");
			t2 = text("▼");
			t3 = space();
			if (if_block) if_block.c();
			this.h();
		},
		l(nodes) {
			div = claim_element(nodes, "DIV", { class: true });
			var div_nodes = children(div);
			button = claim_element(div_nodes, "BUTTON", { class: true });
			var button_nodes = children(button);
			h3 = claim_element(button_nodes, "H3", { class: true });
			var h3_nodes = children(h3);
			t0 = claim_text(h3_nodes, "Extension Activities");
			h3_nodes.forEach(detach);
			t1 = claim_space(button_nodes);
			span = claim_element(button_nodes, "SPAN", { class: true });
			var span_nodes = children(span);
			t2 = claim_text(span_nodes, "▼");
			span_nodes.forEach(detach);
			button_nodes.forEach(detach);
			t3 = claim_space(div_nodes);
			if (if_block) if_block.l(div_nodes);
			div_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(h3, "class", "svelte-18lncot");

			attr(span, "class", span_class_value = "expand-icon " + (/*expandedSections*/ ctx[4].has('extensions')
			? 'expanded'
			: '') + " svelte-18lncot");

			attr(button, "class", "section-header svelte-18lncot");
			attr(div, "class", "content-section svelte-18lncot");
		},
		m(target, anchor) {
			insert_hydration(target, div, anchor);
			append_hydration(div, button);
			append_hydration(button, h3);
			append_hydration(h3, t0);
			append_hydration(button, t1);
			append_hydration(button, span);
			append_hydration(span, t2);
			append_hydration(div, t3);
			if (if_block) if_block.m(div, null);

			if (!mounted) {
				dispose = listen(button, "click", /*click_handler_14*/ ctx[27]);
				mounted = true;
			}
		},
		p(ctx, dirty) {
			if (dirty[0] & /*expandedSections*/ 16 && span_class_value !== (span_class_value = "expand-icon " + (/*expandedSections*/ ctx[4].has('extensions')
			? 'expanded'
			: '') + " svelte-18lncot")) {
				attr(span, "class", span_class_value);
			}

			if (dirty[0] & /*expandedSections*/ 16) show_if = /*expandedSections*/ ctx[4].has('extensions');

			if (show_if) {
				if (if_block) {
					if_block.p(ctx, dirty);
				} else {
					if_block = create_if_block_9(ctx);
					if_block.c();
					if_block.m(div, null);
				}
			} else if (if_block) {
				if_block.d(1);
				if_block = null;
			}
		},
		d(detaching) {
			if (detaching) detach(div);
			if (if_block) if_block.d();
			mounted = false;
			dispose();
		}
	};
}

// (1294:12) {#if expandedSections.has('extensions')}
function create_if_block_9(ctx) {
	let div;
	let ul;
	let each_value_3 = /*currentWeek*/ ctx[6].teacherNotes.extensions;
	let each_blocks = [];

	for (let i = 0; i < each_value_3.length; i += 1) {
		each_blocks[i] = create_each_block_3(get_each_context_3(ctx, each_value_3, i));
	}

	return {
		c() {
			div = element("div");
			ul = element("ul");

			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].c();
			}

			this.h();
		},
		l(nodes) {
			div = claim_element(nodes, "DIV", { class: true });
			var div_nodes = children(div);
			ul = claim_element(div_nodes, "UL", { class: true });
			var ul_nodes = children(ul);

			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].l(ul_nodes);
			}

			ul_nodes.forEach(detach);
			div_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(ul, "class", "extensions-list svelte-18lncot");
			attr(div, "class", "section-content svelte-18lncot");
		},
		m(target, anchor) {
			insert_hydration(target, div, anchor);
			append_hydration(div, ul);

			for (let i = 0; i < each_blocks.length; i += 1) {
				if (each_blocks[i]) {
					each_blocks[i].m(ul, null);
				}
			}
		},
		p(ctx, dirty) {
			if (dirty[0] & /*currentWeek*/ 64) {
				each_value_3 = /*currentWeek*/ ctx[6].teacherNotes.extensions;
				let i;

				for (i = 0; i < each_value_3.length; i += 1) {
					const child_ctx = get_each_context_3(ctx, each_value_3, i);

					if (each_blocks[i]) {
						each_blocks[i].p(child_ctx, dirty);
					} else {
						each_blocks[i] = create_each_block_3(child_ctx);
						each_blocks[i].c();
						each_blocks[i].m(ul, null);
					}
				}

				for (; i < each_blocks.length; i += 1) {
					each_blocks[i].d(1);
				}

				each_blocks.length = each_value_3.length;
			}
		},
		d(detaching) {
			if (detaching) detach(div);
			destroy_each(each_blocks, detaching);
		}
	};
}

// (1297:18) {#each currentWeek.teacherNotes.extensions as extension}
function create_each_block_3(ctx) {
	let li;
	let t_value = /*extension*/ ctx[38] + "";
	let t;

	return {
		c() {
			li = element("li");
			t = text(t_value);
			this.h();
		},
		l(nodes) {
			li = claim_element(nodes, "LI", { class: true });
			var li_nodes = children(li);
			t = claim_text(li_nodes, t_value);
			li_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(li, "class", "svelte-18lncot");
		},
		m(target, anchor) {
			insert_hydration(target, li, anchor);
			append_hydration(li, t);
		},
		p(ctx, dirty) {
			if (dirty[0] & /*currentWeek*/ 64 && t_value !== (t_value = /*extension*/ ctx[38] + "")) set_data(t, t_value);
		},
		d(detaching) {
			if (detaching) detach(li);
		}
	};
}

// (1097:8) {#if expandedSections.has('objectives')}
function create_if_block_6(ctx) {
	let div;
	let p;
	let t0;
	let t1;
	let ul;
	let each_value_2 = /*currentWeek*/ ctx[6].objectives;
	let each_blocks = [];

	for (let i = 0; i < each_value_2.length; i += 1) {
		each_blocks[i] = create_each_block_2(get_each_context_2(ctx, each_value_2, i));
	}

	return {
		c() {
			div = element("div");
			p = element("p");
			t0 = text("By the end of this lesson, students will be able to:");
			t1 = space();
			ul = element("ul");

			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].c();
			}

			this.h();
		},
		l(nodes) {
			div = claim_element(nodes, "DIV", { class: true });
			var div_nodes = children(div);
			p = claim_element(div_nodes, "P", {});
			var p_nodes = children(p);
			t0 = claim_text(p_nodes, "By the end of this lesson, students will be able to:");
			p_nodes.forEach(detach);
			t1 = claim_space(div_nodes);
			ul = claim_element(div_nodes, "UL", { class: true });
			var ul_nodes = children(ul);

			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].l(ul_nodes);
			}

			ul_nodes.forEach(detach);
			div_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(ul, "class", "objectives-list svelte-18lncot");
			attr(div, "class", "section-content svelte-18lncot");
		},
		m(target, anchor) {
			insert_hydration(target, div, anchor);
			append_hydration(div, p);
			append_hydration(p, t0);
			append_hydration(div, t1);
			append_hydration(div, ul);

			for (let i = 0; i < each_blocks.length; i += 1) {
				if (each_blocks[i]) {
					each_blocks[i].m(ul, null);
				}
			}
		},
		p(ctx, dirty) {
			if (dirty[0] & /*currentWeek*/ 64) {
				each_value_2 = /*currentWeek*/ ctx[6].objectives;
				let i;

				for (i = 0; i < each_value_2.length; i += 1) {
					const child_ctx = get_each_context_2(ctx, each_value_2, i);

					if (each_blocks[i]) {
						each_blocks[i].p(child_ctx, dirty);
					} else {
						each_blocks[i] = create_each_block_2(child_ctx);
						each_blocks[i].c();
						each_blocks[i].m(ul, null);
					}
				}

				for (; i < each_blocks.length; i += 1) {
					each_blocks[i].d(1);
				}

				each_blocks.length = each_value_2.length;
			}
		},
		d(detaching) {
			if (detaching) detach(div);
			destroy_each(each_blocks, detaching);
		}
	};
}

// (1101:14) {#each currentWeek.objectives as objective}
function create_each_block_2(ctx) {
	let li;
	let t_value = /*objective*/ ctx[35] + "";
	let t;

	return {
		c() {
			li = element("li");
			t = text(t_value);
			this.h();
		},
		l(nodes) {
			li = claim_element(nodes, "LI", { class: true });
			var li_nodes = children(li);
			t = claim_text(li_nodes, t_value);
			li_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(li, "class", "svelte-18lncot");
		},
		m(target, anchor) {
			insert_hydration(target, li, anchor);
			append_hydration(li, t);
		},
		p(ctx, dirty) {
			if (dirty[0] & /*currentWeek*/ 64 && t_value !== (t_value = /*objective*/ ctx[35] + "")) set_data(t, t_value);
		},
		d(detaching) {
			if (detaching) detach(li);
		}
	};
}

// (1119:8) {#if expandedSections.has('materials')}
function create_if_block_5(ctx) {
	let div1;
	let div0;
	let each_value_1 = /*currentWeek*/ ctx[6].lesson.materials;
	let each_blocks = [];

	for (let i = 0; i < each_value_1.length; i += 1) {
		each_blocks[i] = create_each_block_1(get_each_context_1(ctx, each_value_1, i));
	}

	return {
		c() {
			div1 = element("div");
			div0 = element("div");

			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].c();
			}

			this.h();
		},
		l(nodes) {
			div1 = claim_element(nodes, "DIV", { class: true });
			var div1_nodes = children(div1);
			div0 = claim_element(div1_nodes, "DIV", { class: true });
			var div0_nodes = children(div0);

			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].l(div0_nodes);
			}

			div0_nodes.forEach(detach);
			div1_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(div0, "class", "materials-grid svelte-18lncot");
			attr(div1, "class", "section-content svelte-18lncot");
		},
		m(target, anchor) {
			insert_hydration(target, div1, anchor);
			append_hydration(div1, div0);

			for (let i = 0; i < each_blocks.length; i += 1) {
				if (each_blocks[i]) {
					each_blocks[i].m(div0, null);
				}
			}
		},
		p(ctx, dirty) {
			if (dirty[0] & /*currentWeek*/ 64) {
				each_value_1 = /*currentWeek*/ ctx[6].lesson.materials;
				let i;

				for (i = 0; i < each_value_1.length; i += 1) {
					const child_ctx = get_each_context_1(ctx, each_value_1, i);

					if (each_blocks[i]) {
						each_blocks[i].p(child_ctx, dirty);
					} else {
						each_blocks[i] = create_each_block_1(child_ctx);
						each_blocks[i].c();
						each_blocks[i].m(div0, null);
					}
				}

				for (; i < each_blocks.length; i += 1) {
					each_blocks[i].d(1);
				}

				each_blocks.length = each_value_1.length;
			}
		},
		d(detaching) {
			if (detaching) detach(div1);
			destroy_each(each_blocks, detaching);
		}
	};
}

// (1122:14) {#each currentWeek.lesson.materials as material}
function create_each_block_1(ctx) {
	let div;
	let span;
	let t0;
	let t1;
	let t2_value = /*material*/ ctx[32] + "";
	let t2;
	let t3;

	return {
		c() {
			div = element("div");
			span = element("span");
			t0 = text("📋");
			t1 = space();
			t2 = text(t2_value);
			t3 = space();
			this.h();
		},
		l(nodes) {
			div = claim_element(nodes, "DIV", { class: true });
			var div_nodes = children(div);
			span = claim_element(div_nodes, "SPAN", { class: true });
			var span_nodes = children(span);
			t0 = claim_text(span_nodes, "📋");
			span_nodes.forEach(detach);
			t1 = claim_space(div_nodes);
			t2 = claim_text(div_nodes, t2_value);
			t3 = claim_space(div_nodes);
			div_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(span, "class", "material-icon");
			attr(div, "class", "material-item svelte-18lncot");
		},
		m(target, anchor) {
			insert_hydration(target, div, anchor);
			append_hydration(div, span);
			append_hydration(span, t0);
			append_hydration(div, t1);
			append_hydration(div, t2);
			append_hydration(div, t3);
		},
		p(ctx, dirty) {
			if (dirty[0] & /*currentWeek*/ 64 && t2_value !== (t2_value = /*material*/ ctx[32] + "")) set_data(t2, t2_value);
		},
		d(detaching) {
			if (detaching) detach(div);
		}
	};
}

// (1143:8) {#if expandedSections.has('introduction')}
function create_if_block_4(ctx) {
	let div1;
	let div0;
	let p;
	let t_value = /*currentWeek*/ ctx[6].lesson.introduction + "";
	let t;

	return {
		c() {
			div1 = element("div");
			div0 = element("div");
			p = element("p");
			t = text(t_value);
			this.h();
		},
		l(nodes) {
			div1 = claim_element(nodes, "DIV", { class: true });
			var div1_nodes = children(div1);
			div0 = claim_element(div1_nodes, "DIV", { class: true });
			var div0_nodes = children(div0);
			p = claim_element(div0_nodes, "P", {});
			var p_nodes = children(p);
			t = claim_text(p_nodes, t_value);
			p_nodes.forEach(detach);
			div0_nodes.forEach(detach);
			div1_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(div0, "class", "introduction-content svelte-18lncot");
			attr(div1, "class", "section-content svelte-18lncot");
		},
		m(target, anchor) {
			insert_hydration(target, div1, anchor);
			append_hydration(div1, div0);
			append_hydration(div0, p);
			append_hydration(p, t);
		},
		p(ctx, dirty) {
			if (dirty[0] & /*currentWeek*/ 64 && t_value !== (t_value = /*currentWeek*/ ctx[6].lesson.introduction + "")) set_data(t, t_value);
		},
		d(detaching) {
			if (detaching) detach(div1);
		}
	};
}

// (1162:8) {#if expandedSections.has('main-content')}
function create_if_block_3(ctx) {
	let div;
	let each_value = /*currentWeek*/ ctx[6].lesson.mainContent;
	let each_blocks = [];

	for (let i = 0; i < each_value.length; i += 1) {
		each_blocks[i] = create_each_block(get_each_context(ctx, each_value, i));
	}

	return {
		c() {
			div = element("div");

			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].c();
			}

			this.h();
		},
		l(nodes) {
			div = claim_element(nodes, "DIV", { class: true });
			var div_nodes = children(div);

			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].l(div_nodes);
			}

			div_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(div, "class", "section-content svelte-18lncot");
		},
		m(target, anchor) {
			insert_hydration(target, div, anchor);

			for (let i = 0; i < each_blocks.length; i += 1) {
				if (each_blocks[i]) {
					each_blocks[i].m(div, null);
				}
			}
		},
		p(ctx, dirty) {
			if (dirty[0] & /*currentWeek*/ 64) {
				each_value = /*currentWeek*/ ctx[6].lesson.mainContent;
				let i;

				for (i = 0; i < each_value.length; i += 1) {
					const child_ctx = get_each_context(ctx, each_value, i);

					if (each_blocks[i]) {
						each_blocks[i].p(child_ctx, dirty);
					} else {
						each_blocks[i] = create_each_block(child_ctx);
						each_blocks[i].c();
						each_blocks[i].m(div, null);
					}
				}

				for (; i < each_blocks.length; i += 1) {
					each_blocks[i].d(1);
				}

				each_blocks.length = each_value.length;
			}
		},
		d(detaching) {
			if (detaching) detach(div);
			destroy_each(each_blocks, detaching);
		}
	};
}

// (1164:12) {#each currentWeek.lesson.mainContent as section, index}
function create_each_block(ctx) {
	let div2;
	let div0;
	let h4;
	let t0_value = /*section*/ ctx[29].section + "";
	let t0;
	let t1;
	let span;
	let t2;
	let t3_value = /*section*/ ctx[29].duration + "";
	let t3;
	let t4;
	let div1;
	let p0;
	let strong0;
	let t5;
	let t6;
	let t7_value = /*section*/ ctx[29].content + "";
	let t7;
	let t8;
	let p1;
	let strong1;
	let t9;
	let t10;
	let t11_value = /*section*/ ctx[29].activity + "";
	let t11;
	let t12;

	return {
		c() {
			div2 = element("div");
			div0 = element("div");
			h4 = element("h4");
			t0 = text(t0_value);
			t1 = space();
			span = element("span");
			t2 = text("⏱️ ");
			t3 = text(t3_value);
			t4 = space();
			div1 = element("div");
			p0 = element("p");
			strong0 = element("strong");
			t5 = text("Content:");
			t6 = space();
			t7 = text(t7_value);
			t8 = space();
			p1 = element("p");
			strong1 = element("strong");
			t9 = text("Activity:");
			t10 = space();
			t11 = text(t11_value);
			t12 = space();
			this.h();
		},
		l(nodes) {
			div2 = claim_element(nodes, "DIV", { class: true });
			var div2_nodes = children(div2);
			div0 = claim_element(div2_nodes, "DIV", { class: true });
			var div0_nodes = children(div0);
			h4 = claim_element(div0_nodes, "H4", { class: true });
			var h4_nodes = children(h4);
			t0 = claim_text(h4_nodes, t0_value);
			h4_nodes.forEach(detach);
			t1 = claim_space(div0_nodes);
			span = claim_element(div0_nodes, "SPAN", { class: true });
			var span_nodes = children(span);
			t2 = claim_text(span_nodes, "⏱️ ");
			t3 = claim_text(span_nodes, t3_value);
			span_nodes.forEach(detach);
			div0_nodes.forEach(detach);
			t4 = claim_space(div2_nodes);
			div1 = claim_element(div2_nodes, "DIV", { class: true });
			var div1_nodes = children(div1);
			p0 = claim_element(div1_nodes, "P", { class: true });
			var p0_nodes = children(p0);
			strong0 = claim_element(p0_nodes, "STRONG", {});
			var strong0_nodes = children(strong0);
			t5 = claim_text(strong0_nodes, "Content:");
			strong0_nodes.forEach(detach);
			t6 = claim_space(p0_nodes);
			t7 = claim_text(p0_nodes, t7_value);
			p0_nodes.forEach(detach);
			t8 = claim_space(div1_nodes);
			p1 = claim_element(div1_nodes, "P", { class: true });
			var p1_nodes = children(p1);
			strong1 = claim_element(p1_nodes, "STRONG", {});
			var strong1_nodes = children(strong1);
			t9 = claim_text(strong1_nodes, "Activity:");
			strong1_nodes.forEach(detach);
			t10 = claim_space(p1_nodes);
			t11 = claim_text(p1_nodes, t11_value);
			p1_nodes.forEach(detach);
			div1_nodes.forEach(detach);
			t12 = claim_space(div2_nodes);
			div2_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(h4, "class", "svelte-18lncot");
			attr(span, "class", "section-duration svelte-18lncot");
			attr(div0, "class", "section-title svelte-18lncot");
			attr(p0, "class", "svelte-18lncot");
			attr(p1, "class", "svelte-18lncot");
			attr(div1, "class", "section-description svelte-18lncot");
			attr(div2, "class", "lesson-section svelte-18lncot");
		},
		m(target, anchor) {
			insert_hydration(target, div2, anchor);
			append_hydration(div2, div0);
			append_hydration(div0, h4);
			append_hydration(h4, t0);
			append_hydration(div0, t1);
			append_hydration(div0, span);
			append_hydration(span, t2);
			append_hydration(span, t3);
			append_hydration(div2, t4);
			append_hydration(div2, div1);
			append_hydration(div1, p0);
			append_hydration(p0, strong0);
			append_hydration(strong0, t5);
			append_hydration(p0, t6);
			append_hydration(p0, t7);
			append_hydration(div1, t8);
			append_hydration(div1, p1);
			append_hydration(p1, strong1);
			append_hydration(strong1, t9);
			append_hydration(p1, t10);
			append_hydration(p1, t11);
			append_hydration(div2, t12);
		},
		p(ctx, dirty) {
			if (dirty[0] & /*currentWeek*/ 64 && t0_value !== (t0_value = /*section*/ ctx[29].section + "")) set_data(t0, t0_value);
			if (dirty[0] & /*currentWeek*/ 64 && t3_value !== (t3_value = /*section*/ ctx[29].duration + "")) set_data(t3, t3_value);
			if (dirty[0] & /*currentWeek*/ 64 && t7_value !== (t7_value = /*section*/ ctx[29].content + "")) set_data(t7, t7_value);
			if (dirty[0] & /*currentWeek*/ 64 && t11_value !== (t11_value = /*section*/ ctx[29].activity + "")) set_data(t11, t11_value);
		},
		d(detaching) {
			if (detaching) detach(div2);
		}
	};
}

// (1190:8) {#if expandedSections.has('assessment')}
function create_if_block_2(ctx) {
	let div3;
	let div2;
	let div0;
	let h40;
	let t0;
	let t1;
	let p0;
	let t2_value = /*currentWeek*/ ctx[6].lesson.assessment + "";
	let t2;
	let t3;
	let div1;
	let h41;
	let t4;
	let t5;
	let p1;
	let t6_value = /*currentWeek*/ ctx[6].lesson.homework + "";
	let t6;

	return {
		c() {
			div3 = element("div");
			div2 = element("div");
			div0 = element("div");
			h40 = element("h4");
			t0 = text("In-Class Assessment");
			t1 = space();
			p0 = element("p");
			t2 = text(t2_value);
			t3 = space();
			div1 = element("div");
			h41 = element("h4");
			t4 = text("Homework Assignment");
			t5 = space();
			p1 = element("p");
			t6 = text(t6_value);
			this.h();
		},
		l(nodes) {
			div3 = claim_element(nodes, "DIV", { class: true });
			var div3_nodes = children(div3);
			div2 = claim_element(div3_nodes, "DIV", { class: true });
			var div2_nodes = children(div2);
			div0 = claim_element(div2_nodes, "DIV", { class: true });
			var div0_nodes = children(div0);
			h40 = claim_element(div0_nodes, "H4", { class: true });
			var h40_nodes = children(h40);
			t0 = claim_text(h40_nodes, "In-Class Assessment");
			h40_nodes.forEach(detach);
			t1 = claim_space(div0_nodes);
			p0 = claim_element(div0_nodes, "P", {});
			var p0_nodes = children(p0);
			t2 = claim_text(p0_nodes, t2_value);
			p0_nodes.forEach(detach);
			div0_nodes.forEach(detach);
			t3 = claim_space(div2_nodes);
			div1 = claim_element(div2_nodes, "DIV", { class: true });
			var div1_nodes = children(div1);
			h41 = claim_element(div1_nodes, "H4", { class: true });
			var h41_nodes = children(h41);
			t4 = claim_text(h41_nodes, "Homework Assignment");
			h41_nodes.forEach(detach);
			t5 = claim_space(div1_nodes);
			p1 = claim_element(div1_nodes, "P", {});
			var p1_nodes = children(p1);
			t6 = claim_text(p1_nodes, t6_value);
			p1_nodes.forEach(detach);
			div1_nodes.forEach(detach);
			div2_nodes.forEach(detach);
			div3_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(h40, "class", "svelte-18lncot");
			attr(div0, "class", "assessment-item svelte-18lncot");
			attr(h41, "class", "svelte-18lncot");
			attr(div1, "class", "homework-item svelte-18lncot");
			attr(div2, "class", "assessment-content svelte-18lncot");
			attr(div3, "class", "section-content svelte-18lncot");
		},
		m(target, anchor) {
			insert_hydration(target, div3, anchor);
			append_hydration(div3, div2);
			append_hydration(div2, div0);
			append_hydration(div0, h40);
			append_hydration(h40, t0);
			append_hydration(div0, t1);
			append_hydration(div0, p0);
			append_hydration(p0, t2);
			append_hydration(div2, t3);
			append_hydration(div2, div1);
			append_hydration(div1, h41);
			append_hydration(h41, t4);
			append_hydration(div1, t5);
			append_hydration(div1, p1);
			append_hydration(p1, t6);
		},
		p(ctx, dirty) {
			if (dirty[0] & /*currentWeek*/ 64 && t2_value !== (t2_value = /*currentWeek*/ ctx[6].lesson.assessment + "")) set_data(t2, t2_value);
			if (dirty[0] & /*currentWeek*/ 64 && t6_value !== (t6_value = /*currentWeek*/ ctx[6].lesson.homework + "")) set_data(t6, t6_value);
		},
		d(detaching) {
			if (detaching) detach(div3);
		}
	};
}

function create_fragment(ctx) {
	let section;
	let div0;
	let h1;
	let t0;
	let t1;
	let p;
	let t2;
	let t3;
	let div1;
	let button0;
	let span0;
	let t4;
	let t5;
	let t6;
	let button1;
	let span1;
	let t7;
	let t8;
	let t9;
	let div6;
	let div3;
	let h30;
	let t10;
	let t11;
	let div2;
	let t12;
	let div5;
	let h31;
	let t13;
	let t14;
	let div4;
	let t15;
	let if_block_anchor;
	let mounted;
	let dispose;
	let each_value_11 = Object.entries(/*modules*/ ctx[7]);
	let each_blocks_1 = [];

	for (let i = 0; i < each_value_11.length; i += 1) {
		each_blocks_1[i] = create_each_block_11(get_each_context_11(ctx, each_value_11, i));
	}

	let each_value_10 = /*currentModule*/ ctx[5].weeks;
	let each_blocks = [];

	for (let i = 0; i < each_value_10.length; i += 1) {
		each_blocks[i] = create_each_block_10(get_each_context_10(ctx, each_value_10, i));
	}

	function select_block_type_1(ctx, dirty) {
		if (/*currentWeek*/ ctx[6]) return create_if_block;
		return create_else_block;
	}

	let current_block_type = select_block_type_1(ctx);
	let if_block = current_block_type(ctx);

	return {
		c() {
			section = element("section");
			div0 = element("div");
			h1 = element("h1");
			t0 = text("Course Content");
			t1 = space();
			p = element("p");
			t2 = text("Comprehensive 12-week ICDL curriculum with detailed lesson plans and teaching resources");
			t3 = space();
			div1 = element("div");
			button0 = element("button");
			span0 = element("span");
			t4 = text("📝");
			t5 = text("\n      View Assessments");
			t6 = space();
			button1 = element("button");
			span1 = element("span");
			t7 = text("🖨️");
			t8 = text("\n      Print Lesson");
			t9 = space();
			div6 = element("div");
			div3 = element("div");
			h30 = element("h3");
			t10 = text("Course Modules");
			t11 = space();
			div2 = element("div");

			for (let i = 0; i < each_blocks_1.length; i += 1) {
				each_blocks_1[i].c();
			}

			t12 = space();
			div5 = element("div");
			h31 = element("h3");
			t13 = text("Week Selection");
			t14 = space();
			div4 = element("div");

			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].c();
			}

			t15 = space();
			if_block.c();
			if_block_anchor = empty();
			this.h();
		},
		l(nodes) {
			section = claim_element(nodes, "SECTION", { class: true });
			var section_nodes = children(section);
			div0 = claim_element(section_nodes, "DIV", { class: true });
			var div0_nodes = children(div0);
			h1 = claim_element(div0_nodes, "H1", { class: true });
			var h1_nodes = children(h1);
			t0 = claim_text(h1_nodes, "Course Content");
			h1_nodes.forEach(detach);
			t1 = claim_space(div0_nodes);
			p = claim_element(div0_nodes, "P", { class: true });
			var p_nodes = children(p);
			t2 = claim_text(p_nodes, "Comprehensive 12-week ICDL curriculum with detailed lesson plans and teaching resources");
			p_nodes.forEach(detach);
			div0_nodes.forEach(detach);
			t3 = claim_space(section_nodes);
			div1 = claim_element(section_nodes, "DIV", { class: true });
			var div1_nodes = children(div1);
			button0 = claim_element(div1_nodes, "BUTTON", { class: true });
			var button0_nodes = children(button0);
			span0 = claim_element(button0_nodes, "SPAN", { class: true });
			var span0_nodes = children(span0);
			t4 = claim_text(span0_nodes, "📝");
			span0_nodes.forEach(detach);
			t5 = claim_text(button0_nodes, "\n      View Assessments");
			button0_nodes.forEach(detach);
			t6 = claim_space(div1_nodes);
			button1 = claim_element(div1_nodes, "BUTTON", { class: true });
			var button1_nodes = children(button1);
			span1 = claim_element(button1_nodes, "SPAN", { class: true });
			var span1_nodes = children(span1);
			t7 = claim_text(span1_nodes, "🖨️");
			span1_nodes.forEach(detach);
			t8 = claim_text(button1_nodes, "\n      Print Lesson");
			button1_nodes.forEach(detach);
			div1_nodes.forEach(detach);
			section_nodes.forEach(detach);
			t9 = claim_space(nodes);
			div6 = claim_element(nodes, "DIV", { class: true });
			var div6_nodes = children(div6);
			div3 = claim_element(div6_nodes, "DIV", { class: true });
			var div3_nodes = children(div3);
			h30 = claim_element(div3_nodes, "H3", { class: true });
			var h30_nodes = children(h30);
			t10 = claim_text(h30_nodes, "Course Modules");
			h30_nodes.forEach(detach);
			t11 = claim_space(div3_nodes);
			div2 = claim_element(div3_nodes, "DIV", { class: true });
			var div2_nodes = children(div2);

			for (let i = 0; i < each_blocks_1.length; i += 1) {
				each_blocks_1[i].l(div2_nodes);
			}

			div2_nodes.forEach(detach);
			div3_nodes.forEach(detach);
			t12 = claim_space(div6_nodes);
			div5 = claim_element(div6_nodes, "DIV", { class: true });
			var div5_nodes = children(div5);
			h31 = claim_element(div5_nodes, "H3", { class: true });
			var h31_nodes = children(h31);
			t13 = claim_text(h31_nodes, "Week Selection");
			h31_nodes.forEach(detach);
			t14 = claim_space(div5_nodes);
			div4 = claim_element(div5_nodes, "DIV", { class: true });
			var div4_nodes = children(div4);

			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].l(div4_nodes);
			}

			div4_nodes.forEach(detach);
			div5_nodes.forEach(detach);
			div6_nodes.forEach(detach);
			t15 = claim_space(nodes);
			if_block.l(nodes);
			if_block_anchor = empty();
			this.h();
		},
		h() {
			attr(h1, "class", "svelte-18lncot");
			attr(p, "class", "svelte-18lncot");
			attr(div0, "class", "header-content svelte-18lncot");
			attr(span0, "class", "btn-icon");
			attr(button0, "class", "btn btn-secondary");
			attr(span1, "class", "btn-icon");
			attr(button1, "class", "btn btn-primary no-print svelte-18lncot");
			attr(div1, "class", "header-actions svelte-18lncot");
			attr(section, "class", "course-header svelte-18lncot");
			attr(h30, "class", "svelte-18lncot");
			attr(div2, "class", "module-tabs svelte-18lncot");
			attr(div3, "class", "module-selector svelte-18lncot");
			attr(h31, "class", "svelte-18lncot");
			attr(div4, "class", "week-grid svelte-18lncot");
			attr(div5, "class", "week-selector svelte-18lncot");
			attr(div6, "class", "course-navigation svelte-18lncot");
		},
		m(target, anchor) {
			insert_hydration(target, section, anchor);
			append_hydration(section, div0);
			append_hydration(div0, h1);
			append_hydration(h1, t0);
			append_hydration(div0, t1);
			append_hydration(div0, p);
			append_hydration(p, t2);
			append_hydration(section, t3);
			append_hydration(section, div1);
			append_hydration(div1, button0);
			append_hydration(button0, span0);
			append_hydration(span0, t4);
			append_hydration(button0, t5);
			append_hydration(div1, t6);
			append_hydration(div1, button1);
			append_hydration(button1, span1);
			append_hydration(span1, t7);
			append_hydration(button1, t8);
			insert_hydration(target, t9, anchor);
			insert_hydration(target, div6, anchor);
			append_hydration(div6, div3);
			append_hydration(div3, h30);
			append_hydration(h30, t10);
			append_hydration(div3, t11);
			append_hydration(div3, div2);

			for (let i = 0; i < each_blocks_1.length; i += 1) {
				if (each_blocks_1[i]) {
					each_blocks_1[i].m(div2, null);
				}
			}

			append_hydration(div6, t12);
			append_hydration(div6, div5);
			append_hydration(div5, h31);
			append_hydration(h31, t13);
			append_hydration(div5, t14);
			append_hydration(div5, div4);

			for (let i = 0; i < each_blocks.length; i += 1) {
				if (each_blocks[i]) {
					each_blocks[i].m(div4, null);
				}
			}

			insert_hydration(target, t15, anchor);
			if_block.m(target, anchor);
			insert_hydration(target, if_block_anchor, anchor);

			if (!mounted) {
				dispose = [
					listen(button0, "click", /*click_handler*/ ctx[13]),
					listen(button1, "click", printLesson)
				];

				mounted = true;
			}
		},
		p(ctx, dirty) {
			if (dirty[0] & /*modules, selectedModule, selectModule*/ 642) {
				each_value_11 = Object.entries(/*modules*/ ctx[7]);
				let i;

				for (i = 0; i < each_value_11.length; i += 1) {
					const child_ctx = get_each_context_11(ctx, each_value_11, i);

					if (each_blocks_1[i]) {
						each_blocks_1[i].p(child_ctx, dirty);
					} else {
						each_blocks_1[i] = create_each_block_11(child_ctx);
						each_blocks_1[i].c();
						each_blocks_1[i].m(div2, null);
					}
				}

				for (; i < each_blocks_1.length; i += 1) {
					each_blocks_1[i].d(1);
				}

				each_blocks_1.length = each_value_11.length;
			}

			if (dirty[0] & /*currentModule, selectedWeek, selectWeek, weeklyContent*/ 1316) {
				each_value_10 = /*currentModule*/ ctx[5].weeks;
				let i;

				for (i = 0; i < each_value_10.length; i += 1) {
					const child_ctx = get_each_context_10(ctx, each_value_10, i);

					if (each_blocks[i]) {
						each_blocks[i].p(child_ctx, dirty);
					} else {
						each_blocks[i] = create_each_block_10(child_ctx);
						each_blocks[i].c();
						each_blocks[i].m(div4, null);
					}
				}

				for (; i < each_blocks.length; i += 1) {
					each_blocks[i].d(1);
				}

				each_blocks.length = each_value_10.length;
			}

			if (current_block_type === (current_block_type = select_block_type_1(ctx)) && if_block) {
				if_block.p(ctx, dirty);
			} else {
				if_block.d(1);
				if_block = current_block_type(ctx);

				if (if_block) {
					if_block.c();
					if_block.m(if_block_anchor.parentNode, if_block_anchor);
				}
			}
		},
		i: noop,
		o: noop,
		d(detaching) {
			if (detaching) detach(section);
			if (detaching) detach(t9);
			if (detaching) detach(div6);
			destroy_each(each_blocks_1, detaching);
			destroy_each(each_blocks, detaching);
			if (detaching) detach(t15);
			if_block.d(detaching);
			if (detaching) detach(if_block_anchor);
			mounted = false;
			run_all(dispose);
		}
	};
}

function printLesson() {
	window.print();
}

function instance($$self, $$props, $$invalidate) {
	let currentWeek;
	let currentModule;
	let { props } = $$props;
	let { onNavigate } = $$props;

	// State management
	let selectedModule = 'computer-essentials';

	let selectedWeek = 1;
	let activeTab = 'lesson'; // lesson, teacher-notes, activities
	let expandedSections = new Set(['overview']);

	// Course structure data
	const modules = {
		'computer-essentials': {
			title: 'Computer Essentials',
			icon: '💻',
			color: 'blue',
			weeks: [1, 2, 3, 4],
			description: 'Foundation knowledge of computers, operating systems, and file management'
		},
		'online-essentials': {
			title: 'Online Essentials',
			icon: '🌐',
			color: 'green',
			weeks: [5, 6, 7, 8],
			description: 'Internet skills, communication tools, and digital citizenship'
		},
		'word-processing': {
			title: 'Word Processing',
			icon: '📄',
			color: 'purple',
			weeks: [9, 10],
			description: 'Document creation, formatting, and professional presentation'
		},
		'spreadsheets': {
			title: 'Spreadsheets',
			icon: '📊',
			color: 'orange',
			weeks: [11, 12],
			description: 'Data management, calculations, and visual representation'
		}
	};

	// Detailed weekly content
	const weeklyContent = {
		1: {
			title: 'Introduction to Computers & Operating Systems',
			module: 'computer-essentials',
			objectives: [
				'Identify different types of computers and their uses',
				'Understand basic computer components (hardware/software)',
				'Navigate the desktop environment effectively',
				'Recognize common operating system features'
			],
			lesson: {
				duration: '90 minutes',
				materials: [
					'Computer lab access',
					'Presentation slides',
					'Handout worksheets',
					'Interactive whiteboard'
				],
				introduction: 'Welcome students to the digital world! Start with a fun "Computer Scavenger Hunt" where students identify different computing devices around the classroom.',
				mainContent: [
					{
						section: 'What is a Computer?',
						duration: '20 minutes',
						content: 'Interactive discussion about computers in daily life. Show various devices (laptop, smartphone, tablet, smart TV) and discuss their computing capabilities.',
						activity: 'Students create a "Computer Family Tree" showing devices they use at home.'
					},
					{
						section: 'Hardware vs Software',
						duration: '25 minutes',
						content: 'Hands-on exploration of computer components. Use analogies like "hardware is the body, software is the mind" to make concepts relatable.',
						activity: 'Physical component matching game - students match hardware parts with their functions.'
					},
					{
						section: 'Operating System Basics',
						duration: '30 minutes',
						content: 'Guided tour of the desktop environment. Focus on taskbar, start menu, icons, and basic navigation.',
						activity: 'Desktop customization challenge - students personalize their workspace safely.'
					}
				],
				assessment: 'Quick verbal quiz with visual aids. Students point to and name 5 desktop elements.',
				homework: 'Take photos of 3 different computing devices at home and write one sentence about how each is used.'
			},
			teacherNotes: {
				preparation: [
					'Ensure all computers are working and logged in before class',
					'Prepare laminated hardware component cards for matching activity',
					'Test presentation slides and interactive elements',
					'Have backup activities ready for different completion speeds'
				],
				ageGroupAdaptations: {
					'groupA': 'Use more visual aids, gamification with points/badges, shorter activity segments (10-15 min)',
					'groupB': 'Include technical challenges, allow exploration of system settings, discuss gaming hardware',
					'groupC': 'Encourage collaborative discussions, focus on creative applications, include social aspects of technology'
				},
				commonChallenges: [
					'Students with different experience levels - use peer mentoring',
					'Technical issues - have IT support contact ready',
					'Attention spans - use frequent activity changes and movement'
				],
				extensions: [
					'Advanced students can explore system information and specs',
					'Create a class technology timeline showing computer evolution',
					'Research project on future computing trends'
				]
			},
			activities: {
				icebreaker: {
					title: 'Tech in My Life',
					duration: '10 minutes',
					description: 'Students share one way they used technology today before arriving at school.',
					materials: ['None'],
					ageAdaptations: {
						'groupA': 'Use visual prompts or drawings if verbal sharing is challenging',
						'groupB': 'Challenge them to name the most unusual tech device they used',
						'groupC': 'Discuss social media or communication apps they used'
					}
				},
				mindGame: {
					title: 'Binary Human Computer',
					duration: '15 minutes',
					description: 'Students form a human computer chain, passing simple binary messages (thumbs up/down) to demonstrate how computers process information.',
					materials: ['Message cards', 'Stopwatch'],
					ageAdaptations: {
						'groupA': 'Use simple yes/no questions, celebrate successful transmissions',
						'groupB': 'Add complexity with multi-step instructions or competitive timing',
						'groupC': 'Discuss real-world applications and encourage teamwork strategies'
					}
				}
			}
		},
		2: {
			title: 'Files & Folders Management + Quiz 1',
			module: 'computer-essentials',
			objectives: [
				'Create, rename, and organize files and folders',
				'Understand file types and extensions',
				'Use basic file operations (copy, move, delete)',
				'Implement logical folder structures'
			],
			lesson: {
				duration: '90 minutes',
				materials: [
					'Sample files on USB drives',
					'File organization worksheets',
					'Printed folder templates'
				],
				introduction: 'Start with a "Messy Room" analogy - show a photo of a disorganized room and discuss how we organize physical spaces.',
				mainContent: [
					{
						section: 'Understanding Files',
						duration: '20 minutes',
						content: 'Explore different file types through icons and extensions. Demonstrate how computers recognize file types.',
						activity: 'File type detective game - students categorize mystery files by their extensions.'
					},
					{
						section: 'Creating Folder Structures',
						duration: '25 minutes',
						content: 'Demonstrate logical organization principles. Show examples of good vs poor folder organization.',
						activity: 'Students design a folder structure for a fictional student\'s school files.'
					},
					{
						section: 'File Operations Practice',
						duration: '30 minutes',
						content: 'Hands-on practice with creating, copying, moving, and renaming files and folders.',
						activity: 'Digital filing challenge - organize a messy collection of sample files.'
					}
				],
				assessment: 'Quiz 1 - Practical demonstration of file management skills plus written component.',
				homework: 'Organize personal computer files at home using learned principles (with parent permission).'
			},
			teacherNotes: {
				preparation: [
					'Create sample "messy" file collections for each computer',
					'Prepare quiz materials and answer sheets',
					'Set up shared folder for file practice exercises',
					'Have file recovery instructions ready in case of accidents'
				],
				ageGroupAdaptations: {
					'groupA': 'Use colorful folder icons, simple naming conventions, more guided practice',
					'groupB': 'Include keyboard shortcuts, advanced operations like batch renaming',
					'groupC': 'Focus on collaborative file sharing, aesthetic organization principles'
				},
				assessmentFocus: [
					'Practical skills demonstration (70%)',
					'Understanding of organization principles (20%)',
					'File type recognition (10%)'
				]
			},
			activities: {
				icebreaker: {
					title: 'Real World Organization',
					duration: '8 minutes',
					description: 'Students share how they organize something in real life (bedroom, backpack, etc.) and draw parallels to digital organization.',
					materials: ['Whiteboard for drawing examples'],
					ageAdaptations: {
						'groupA': 'Use simple examples like toy boxes or school supplies',
						'groupB': 'Discuss complex systems like sports equipment or collections',
						'groupC': 'Include clothing, accessories, or study materials organization'
					}
				}
			}
		},
		// Additional weeks would continue this pattern...
		3: {
			title: 'Hardware & Software Basics',
			module: 'computer-essentials',
			objectives: [
				'Distinguish between input and output devices',
				'Identify internal computer components',
				'Understand the relationship between hardware and software',
				'Recognize performance factors'
			],
			lesson: {
				duration: '90 minutes',
				materials: [
					'Computer component images',
					'Old computer parts for demonstration',
					'Software installation media'
				],
				introduction: 'Begin with a "Computer Autopsy" - safely examine the inside of an old computer case.',
				mainContent: [
					{
						section: 'Input/Output Devices',
						duration: '25 minutes',
						content: 'Interactive identification of devices and their functions. Discuss how humans interact with computers.',
						activity: 'Human-Computer Interface challenge - students design new input methods for specific tasks.'
					},
					{
						section: 'Inside the Computer',
						duration: '30 minutes',
						content: 'Virtual tour of internal components using diagrams and real parts when possible.',
						activity: 'Component matching and "build a computer" paper craft activity.'
					},
					{
						section: 'Software Categories',
						duration: '25 minutes',
						content: 'Explore system software vs application software with hands-on examples.',
						activity: 'Software sorting game and installation demonstration.'
					}
				],
				assessment: 'Practical component identification and software categorization exercise.',
				homework: 'Interview a family member about the oldest computer they remember using.'
			}
		}
	}; // Continue for all 12 weeks...

	// Functions
	function selectModule(moduleId) {
		$$invalidate(1, selectedModule = moduleId);
		$$invalidate(2, selectedWeek = modules[moduleId].weeks[0]);
	}

	function selectWeek(week) {
		$$invalidate(2, selectedWeek = week);
	}

	function toggleSection(sectionId) {
		if (expandedSections.has(sectionId)) {
			expandedSections.delete(sectionId);
		} else {
			expandedSections.add(sectionId);
		}

		$$invalidate(4, expandedSections); // Trigger reactivity
	}

	const click_handler = () => onNavigate('quizzes');
	const click_handler_1 = moduleId => selectModule(moduleId);
	const click_handler_2 = week => selectWeek(week);
	const click_handler_3 = () => $$invalidate(3, activeTab = 'lesson');
	const click_handler_4 = () => $$invalidate(3, activeTab = 'teacher-notes');
	const click_handler_5 = () => $$invalidate(3, activeTab = 'activities');
	const click_handler_6 = () => toggleSection('objectives');
	const click_handler_7 = () => toggleSection('materials');
	const click_handler_8 = () => toggleSection('introduction');
	const click_handler_9 = () => toggleSection('main-content');
	const click_handler_10 = () => toggleSection('assessment');
	const click_handler_11 = () => toggleSection('preparation');
	const click_handler_12 = () => toggleSection('adaptations');
	const click_handler_13 = () => toggleSection('challenges');
	const click_handler_14 = () => toggleSection('extensions');
	const click_handler_15 = () => selectWeek(1);

	$$self.$$set = $$props => {
		if ('props' in $$props) $$invalidate(12, props = $$props.props);
		if ('onNavigate' in $$props) $$invalidate(0, onNavigate = $$props.onNavigate);
	};

	$$self.$$.update = () => {
		if ($$self.$$.dirty[0] & /*selectedWeek*/ 4) {
			// Reactive statements
			$$invalidate(6, currentWeek = weeklyContent[selectedWeek]);
		}

		if ($$self.$$.dirty[0] & /*selectedModule*/ 2) {
			$$invalidate(5, currentModule = modules[selectedModule]);
		}
	};

	return [
		onNavigate,
		selectedModule,
		selectedWeek,
		activeTab,
		expandedSections,
		currentModule,
		currentWeek,
		modules,
		weeklyContent,
		selectModule,
		selectWeek,
		toggleSection,
		props,
		click_handler,
		click_handler_1,
		click_handler_2,
		click_handler_3,
		click_handler_4,
		click_handler_5,
		click_handler_6,
		click_handler_7,
		click_handler_8,
		click_handler_9,
		click_handler_10,
		click_handler_11,
		click_handler_12,
		click_handler_13,
		click_handler_14,
		click_handler_15
	];
}

class Component extends SvelteComponent {
	constructor(options) {
		super();
		init(this, options, instance, create_fragment, safe_not_equal, { props: 12, onNavigate: 0 }, null, [-1, -1, -1]);
	}
}

export { Component as default };
