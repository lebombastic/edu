// New Block - Updated June 14, 2025
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
function svg_element(name) {
    return document.createElementNS('http://www.w3.org/2000/svg', name);
}
function text(data) {
    return document.createTextNode(data);
}
function space() {
    return text(' ');
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
function claim_svg_element(nodes, name, attributes) {
    return claim_element_base(nodes, name, attributes, svg_element);
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
function set_style(node, key, value, important) {
    if (value == null) {
        node.style.removeProperty(key);
    }
    else {
        node.style.setProperty(key, value, important ? 'important' : '');
    }
}
function toggle_class(element, name, toggle) {
    element.classList[toggle ? 'add' : 'remove'](name);
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

function get_each_context(ctx, list, i) {
	const child_ctx = ctx.slice();
	child_ctx[39] = list[i];
	child_ctx[41] = i;
	return child_ctx;
}

// (848:12) {#if expandedSections[0]}
function create_if_block_5(ctx) {
	let div1;
	let p;
	let t0;
	let t1;
	let div0;
	let button;
	let t2;
	let mounted;
	let dispose;

	return {
		c() {
			div1 = element("div");
			p = element("p");
			t0 = text("This course is designed for individuals with little to no prior knowledge of English. It covers basic grammar, vocabulary, and conversational skills over 8 weeks. Each week focuses on a specific theme, with interactive exercises and quizzes to reinforce learning. Take the weekly test to assess your progress.");
			t1 = space();
			div0 = element("div");
			button = element("button");
			t2 = text("Take Weekly Test");
			this.h();
		},
		l(nodes) {
			div1 = claim_element(nodes, "DIV", { class: true });
			var div1_nodes = children(div1);
			p = claim_element(div1_nodes, "P", { class: true });
			var p_nodes = children(p);
			t0 = claim_text(p_nodes, "This course is designed for individuals with little to no prior knowledge of English. It covers basic grammar, vocabulary, and conversational skills over 8 weeks. Each week focuses on a specific theme, with interactive exercises and quizzes to reinforce learning. Take the weekly test to assess your progress.");
			p_nodes.forEach(detach);
			t1 = claim_space(div1_nodes);
			div0 = claim_element(div1_nodes, "DIV", { class: true });
			var div0_nodes = children(div0);
			button = claim_element(div0_nodes, "BUTTON", { class: true });
			var button_nodes = children(button);
			t2 = claim_text(button_nodes, "Take Weekly Test");
			button_nodes.forEach(detach);
			div0_nodes.forEach(detach);
			div1_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(p, "class", "section-description svelte-1mb9on9");
			attr(button, "class", "secondary-button svelte-1mb9on9");
			attr(div0, "class", "section-button-container svelte-1mb9on9");
			attr(div1, "class", "section-content expanded svelte-1mb9on9");
		},
		m(target, anchor) {
			insert_hydration(target, div1, anchor);
			append_hydration(div1, p);
			append_hydration(p, t0);
			append_hydration(div1, t1);
			append_hydration(div1, div0);
			append_hydration(div0, button);
			append_hydration(button, t2);

			if (!mounted) {
				dispose = listen(button, "click", /*click_handler_2*/ ctx[27]);
				mounted = true;
			}
		},
		p: noop,
		d(detaching) {
			if (detaching) detach(div1);
			mounted = false;
			dispose();
		}
	};
}

// (869:12) {#if expandedSections[1]}
function create_if_block_4(ctx) {
	let div1;
	let p;
	let t0;
	let t1;
	let div0;
	let button;
	let t2;
	let mounted;
	let dispose;

	return {
		c() {
			div1 = element("div");
			p = element("p");
			t0 = text("This course is for learners who have a basic understanding of English and want to improve their fluency and comprehension. It includes more complex grammar, a wider range of vocabulary, and practice in various communication scenarios over 12 weeks. Take the weekly test to assess your progress.");
			t1 = space();
			div0 = element("div");
			button = element("button");
			t2 = text("Take Weekly Test");
			this.h();
		},
		l(nodes) {
			div1 = claim_element(nodes, "DIV", { class: true });
			var div1_nodes = children(div1);
			p = claim_element(div1_nodes, "P", { class: true });
			var p_nodes = children(p);
			t0 = claim_text(p_nodes, "This course is for learners who have a basic understanding of English and want to improve their fluency and comprehension. It includes more complex grammar, a wider range of vocabulary, and practice in various communication scenarios over 12 weeks. Take the weekly test to assess your progress.");
			p_nodes.forEach(detach);
			t1 = claim_space(div1_nodes);
			div0 = claim_element(div1_nodes, "DIV", { class: true });
			var div0_nodes = children(div0);
			button = claim_element(div0_nodes, "BUTTON", { class: true });
			var button_nodes = children(button);
			t2 = claim_text(button_nodes, "Take Weekly Test");
			button_nodes.forEach(detach);
			div0_nodes.forEach(detach);
			div1_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(p, "class", "section-description svelte-1mb9on9");
			attr(button, "class", "secondary-button svelte-1mb9on9");
			attr(div0, "class", "section-button-container svelte-1mb9on9");
			attr(div1, "class", "section-content expanded svelte-1mb9on9");
		},
		m(target, anchor) {
			insert_hydration(target, div1, anchor);
			append_hydration(div1, p);
			append_hydration(p, t0);
			append_hydration(div1, t1);
			append_hydration(div1, div0);
			append_hydration(div0, button);
			append_hydration(button, t2);

			if (!mounted) {
				dispose = listen(button, "click", /*click_handler_4*/ ctx[29]);
				mounted = true;
			}
		},
		p: noop,
		d(detaching) {
			if (detaching) detach(div1);
			mounted = false;
			dispose();
		}
	};
}

// (890:12) {#if expandedSections[2]}
function create_if_block_3(ctx) {
	let div1;
	let p;
	let t0;
	let t1;
	let div0;
	let button;
	let t2;
	let mounted;
	let dispose;

	return {
		c() {
			div1 = element("div");
			p = element("p");
			t0 = text("This course is for advanced learners looking to refine their English skills, focusing on nuanced language use, academic writing, and professional communication. It spans 12 weeks, with challenging materials and discussions. Take the weekly test to assess your progress.");
			t1 = space();
			div0 = element("div");
			button = element("button");
			t2 = text("Take Weekly Test");
			this.h();
		},
		l(nodes) {
			div1 = claim_element(nodes, "DIV", { class: true });
			var div1_nodes = children(div1);
			p = claim_element(div1_nodes, "P", { class: true });
			var p_nodes = children(p);
			t0 = claim_text(p_nodes, "This course is for advanced learners looking to refine their English skills, focusing on nuanced language use, academic writing, and professional communication. It spans 12 weeks, with challenging materials and discussions. Take the weekly test to assess your progress.");
			p_nodes.forEach(detach);
			t1 = claim_space(div1_nodes);
			div0 = claim_element(div1_nodes, "DIV", { class: true });
			var div0_nodes = children(div0);
			button = claim_element(div0_nodes, "BUTTON", { class: true });
			var button_nodes = children(button);
			t2 = claim_text(button_nodes, "Take Weekly Test");
			button_nodes.forEach(detach);
			div0_nodes.forEach(detach);
			div1_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(p, "class", "section-description svelte-1mb9on9");
			attr(button, "class", "secondary-button svelte-1mb9on9");
			attr(div0, "class", "section-button-container svelte-1mb9on9");
			attr(div1, "class", "section-content expanded svelte-1mb9on9");
		},
		m(target, anchor) {
			insert_hydration(target, div1, anchor);
			append_hydration(div1, p);
			append_hydration(p, t0);
			append_hydration(div1, t1);
			append_hydration(div1, div0);
			append_hydration(div0, button);
			append_hydration(button, t2);

			if (!mounted) {
				dispose = listen(button, "click", /*click_handler_6*/ ctx[31]);
				mounted = true;
			}
		},
		p: noop,
		d(detaching) {
			if (detaching) detach(div1);
			mounted = false;
			dispose();
		}
	};
}

// (920:4) {#if showModal}
function create_if_block_1(ctx) {
	let div8;
	let div7;
	let div0;
	let h2;

	let t0_value = (/*currentTestType*/ ctx[5] === 'placement'
	? 'Placement Test'
	: 'Weekly Test') + "";

	let t0;
	let t1;
	let button0;
	let svg;
	let line0;
	let line1;
	let t2;
	let div5;
	let div4;
	let div1;
	let span0;
	let t3;
	let t4_value = /*currentQuestionIndex*/ ctx[1] + 1 + "";
	let t4;
	let t5;
	let t6_value = /*currentQuestions*/ ctx[0].length + "";
	let t6;
	let t7;
	let span1;
	let t8_value = Math.round(/*progress*/ ctx[14]) + "";
	let t8;
	let t9;
	let t10;
	let div3;
	let div2;
	let t11;
	let t12;
	let div6;
	let button1;
	let t13;
	let button1_disabled_value;
	let t14;
	let button2;
	let t15_value = (/*isLastQuestion*/ ctx[13] ? 'Finish Test' : 'Next') + "";
	let t15;
	let button2_disabled_value;
	let mounted;
	let dispose;
	let if_block = /*currentQuestion*/ ctx[15] && create_if_block_2(ctx);

	return {
		c() {
			div8 = element("div");
			div7 = element("div");
			div0 = element("div");
			h2 = element("h2");
			t0 = text(t0_value);
			t1 = space();
			button0 = element("button");
			svg = svg_element("svg");
			line0 = svg_element("line");
			line1 = svg_element("line");
			t2 = space();
			div5 = element("div");
			div4 = element("div");
			div1 = element("div");
			span0 = element("span");
			t3 = text("Question ");
			t4 = text(t4_value);
			t5 = text(" of ");
			t6 = text(t6_value);
			t7 = space();
			span1 = element("span");
			t8 = text(t8_value);
			t9 = text("% Complete");
			t10 = space();
			div3 = element("div");
			div2 = element("div");
			t11 = space();
			if (if_block) if_block.c();
			t12 = space();
			div6 = element("div");
			button1 = element("button");
			t13 = text("Previous");
			t14 = space();
			button2 = element("button");
			t15 = text(t15_value);
			this.h();
		},
		l(nodes) {
			div8 = claim_element(nodes, "DIV", { class: true });
			var div8_nodes = children(div8);
			div7 = claim_element(div8_nodes, "DIV", { class: true });
			var div7_nodes = children(div7);
			div0 = claim_element(div7_nodes, "DIV", { class: true });
			var div0_nodes = children(div0);
			h2 = claim_element(div0_nodes, "H2", { class: true });
			var h2_nodes = children(h2);
			t0 = claim_text(h2_nodes, t0_value);
			h2_nodes.forEach(detach);
			t1 = claim_space(div0_nodes);
			button0 = claim_element(div0_nodes, "BUTTON", { class: true });
			var button0_nodes = children(button0);

			svg = claim_svg_element(button0_nodes, "svg", {
				width: true,
				height: true,
				viewBox: true,
				fill: true,
				stroke: true,
				"stroke-width": true,
				class: true
			});

			var svg_nodes = children(svg);

			line0 = claim_svg_element(svg_nodes, "line", {
				x1: true,
				y1: true,
				x2: true,
				y2: true,
				class: true
			});

			children(line0).forEach(detach);

			line1 = claim_svg_element(svg_nodes, "line", {
				x1: true,
				y1: true,
				x2: true,
				y2: true,
				class: true
			});

			children(line1).forEach(detach);
			svg_nodes.forEach(detach);
			button0_nodes.forEach(detach);
			div0_nodes.forEach(detach);
			t2 = claim_space(div7_nodes);
			div5 = claim_element(div7_nodes, "DIV", { class: true });
			var div5_nodes = children(div5);
			div4 = claim_element(div5_nodes, "DIV", { class: true });
			var div4_nodes = children(div4);
			div1 = claim_element(div4_nodes, "DIV", { class: true });
			var div1_nodes = children(div1);
			span0 = claim_element(div1_nodes, "SPAN", { class: true });
			var span0_nodes = children(span0);
			t3 = claim_text(span0_nodes, "Question ");
			t4 = claim_text(span0_nodes, t4_value);
			t5 = claim_text(span0_nodes, " of ");
			t6 = claim_text(span0_nodes, t6_value);
			span0_nodes.forEach(detach);
			t7 = claim_space(div1_nodes);
			span1 = claim_element(div1_nodes, "SPAN", { class: true });
			var span1_nodes = children(span1);
			t8 = claim_text(span1_nodes, t8_value);
			t9 = claim_text(span1_nodes, "% Complete");
			span1_nodes.forEach(detach);
			div1_nodes.forEach(detach);
			t10 = claim_space(div4_nodes);
			div3 = claim_element(div4_nodes, "DIV", { class: true });
			var div3_nodes = children(div3);
			div2 = claim_element(div3_nodes, "DIV", { class: true, style: true });
			children(div2).forEach(detach);
			div3_nodes.forEach(detach);
			div4_nodes.forEach(detach);
			t11 = claim_space(div5_nodes);
			if (if_block) if_block.l(div5_nodes);
			div5_nodes.forEach(detach);
			t12 = claim_space(div7_nodes);
			div6 = claim_element(div7_nodes, "DIV", { class: true });
			var div6_nodes = children(div6);
			button1 = claim_element(div6_nodes, "BUTTON", { class: true });
			var button1_nodes = children(button1);
			t13 = claim_text(button1_nodes, "Previous");
			button1_nodes.forEach(detach);
			t14 = claim_space(div6_nodes);
			button2 = claim_element(div6_nodes, "BUTTON", { class: true });
			var button2_nodes = children(button2);
			t15 = claim_text(button2_nodes, t15_value);
			button2_nodes.forEach(detach);
			div6_nodes.forEach(detach);
			div7_nodes.forEach(detach);
			div8_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(h2, "class", "modal-title svelte-1mb9on9");
			attr(line0, "x1", "18");
			attr(line0, "y1", "6");
			attr(line0, "x2", "6");
			attr(line0, "y2", "18");
			attr(line0, "class", "svelte-1mb9on9");
			attr(line1, "x1", "6");
			attr(line1, "y1", "6");
			attr(line1, "x2", "18");
			attr(line1, "y2", "18");
			attr(line1, "class", "svelte-1mb9on9");
			attr(svg, "width", "24");
			attr(svg, "height", "24");
			attr(svg, "viewBox", "0 0 24 24");
			attr(svg, "fill", "none");
			attr(svg, "stroke", "currentColor");
			attr(svg, "stroke-width", "2");
			attr(svg, "class", "svelte-1mb9on9");
			attr(button0, "class", "close-button svelte-1mb9on9");
			attr(div0, "class", "modal-header svelte-1mb9on9");
			attr(span0, "class", "svelte-1mb9on9");
			attr(span1, "class", "svelte-1mb9on9");
			attr(div1, "class", "progress-info svelte-1mb9on9");
			attr(div2, "class", "progress-fill svelte-1mb9on9");
			set_style(div2, "width", /*progress*/ ctx[14] + "%");
			attr(div3, "class", "progress-bar svelte-1mb9on9");
			attr(div4, "class", "progress-container svelte-1mb9on9");
			attr(div5, "class", "modal-content svelte-1mb9on9");
			attr(button1, "class", "nav-button svelte-1mb9on9");
			button1.disabled = button1_disabled_value = !/*canGoPrev*/ ctx[11];
			attr(button2, "class", "next-button svelte-1mb9on9");
			button2.disabled = button2_disabled_value = !/*canGoNext*/ ctx[12];
			attr(div6, "class", "modal-footer svelte-1mb9on9");
			attr(div7, "class", "modal svelte-1mb9on9");
			attr(div8, "class", "modal-overlay svelte-1mb9on9");
		},
		m(target, anchor) {
			insert_hydration(target, div8, anchor);
			append_hydration(div8, div7);
			append_hydration(div7, div0);
			append_hydration(div0, h2);
			append_hydration(h2, t0);
			append_hydration(div0, t1);
			append_hydration(div0, button0);
			append_hydration(button0, svg);
			append_hydration(svg, line0);
			append_hydration(svg, line1);
			append_hydration(div7, t2);
			append_hydration(div7, div5);
			append_hydration(div5, div4);
			append_hydration(div4, div1);
			append_hydration(div1, span0);
			append_hydration(span0, t3);
			append_hydration(span0, t4);
			append_hydration(span0, t5);
			append_hydration(span0, t6);
			append_hydration(div1, t7);
			append_hydration(div1, span1);
			append_hydration(span1, t8);
			append_hydration(span1, t9);
			append_hydration(div4, t10);
			append_hydration(div4, div3);
			append_hydration(div3, div2);
			append_hydration(div5, t11);
			if (if_block) if_block.m(div5, null);
			append_hydration(div7, t12);
			append_hydration(div7, div6);
			append_hydration(div6, button1);
			append_hydration(button1, t13);
			append_hydration(div6, t14);
			append_hydration(div6, button2);
			append_hydration(button2, t15);

			if (!mounted) {
				dispose = [
					listen(button0, "click", /*closeModal*/ ctx[18]),
					listen(button1, "click", /*previousQuestion*/ ctx[21]),
					listen(button2, "click", /*nextQuestion*/ ctx[22])
				];

				mounted = true;
			}
		},
		p(ctx, dirty) {
			if (dirty[0] & /*currentTestType*/ 32 && t0_value !== (t0_value = (/*currentTestType*/ ctx[5] === 'placement'
			? 'Placement Test'
			: 'Weekly Test') + "")) set_data(t0, t0_value);

			if (dirty[0] & /*currentQuestionIndex*/ 2 && t4_value !== (t4_value = /*currentQuestionIndex*/ ctx[1] + 1 + "")) set_data(t4, t4_value);
			if (dirty[0] & /*currentQuestions*/ 1 && t6_value !== (t6_value = /*currentQuestions*/ ctx[0].length + "")) set_data(t6, t6_value);
			if (dirty[0] & /*progress*/ 16384 && t8_value !== (t8_value = Math.round(/*progress*/ ctx[14]) + "")) set_data(t8, t8_value);

			if (dirty[0] & /*progress*/ 16384) {
				set_style(div2, "width", /*progress*/ ctx[14] + "%");
			}

			if (/*currentQuestion*/ ctx[15]) {
				if (if_block) {
					if_block.p(ctx, dirty);
				} else {
					if_block = create_if_block_2(ctx);
					if_block.c();
					if_block.m(div5, null);
				}
			} else if (if_block) {
				if_block.d(1);
				if_block = null;
			}

			if (dirty[0] & /*canGoPrev*/ 2048 && button1_disabled_value !== (button1_disabled_value = !/*canGoPrev*/ ctx[11])) {
				button1.disabled = button1_disabled_value;
			}

			if (dirty[0] & /*isLastQuestion*/ 8192 && t15_value !== (t15_value = (/*isLastQuestion*/ ctx[13] ? 'Finish Test' : 'Next') + "")) set_data(t15, t15_value);

			if (dirty[0] & /*canGoNext*/ 4096 && button2_disabled_value !== (button2_disabled_value = !/*canGoNext*/ ctx[12])) {
				button2.disabled = button2_disabled_value;
			}
		},
		d(detaching) {
			if (detaching) detach(div8);
			if (if_block) if_block.d();
			mounted = false;
			run_all(dispose);
		}
	};
}

// (946:16) {#if currentQuestion}
function create_if_block_2(ctx) {
	let div1;
	let h3;
	let t0_value = /*currentQuestion*/ ctx[15].question + "";
	let t0;
	let t1;
	let div0;
	let each_value = /*currentQuestion*/ ctx[15].options;
	let each_blocks = [];

	for (let i = 0; i < each_value.length; i += 1) {
		each_blocks[i] = create_each_block(get_each_context(ctx, each_value, i));
	}

	return {
		c() {
			div1 = element("div");
			h3 = element("h3");
			t0 = text(t0_value);
			t1 = space();
			div0 = element("div");

			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].c();
			}

			this.h();
		},
		l(nodes) {
			div1 = claim_element(nodes, "DIV", { class: true });
			var div1_nodes = children(div1);
			h3 = claim_element(div1_nodes, "H3", { class: true });
			var h3_nodes = children(h3);
			t0 = claim_text(h3_nodes, t0_value);
			h3_nodes.forEach(detach);
			t1 = claim_space(div1_nodes);
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
			attr(h3, "class", "question-text svelte-1mb9on9");
			attr(div0, "class", "options-container svelte-1mb9on9");
			attr(div1, "class", "question-container svelte-1mb9on9");
		},
		m(target, anchor) {
			insert_hydration(target, div1, anchor);
			append_hydration(div1, h3);
			append_hydration(h3, t0);
			append_hydration(div1, t1);
			append_hydration(div1, div0);

			for (let i = 0; i < each_blocks.length; i += 1) {
				if (each_blocks[i]) {
					each_blocks[i].m(div0, null);
				}
			}
		},
		p(ctx, dirty) {
			if (dirty[0] & /*currentQuestion*/ 32768 && t0_value !== (t0_value = /*currentQuestion*/ ctx[15].question + "")) set_data(t0, t0_value);

			if (dirty[0] & /*selectedAnswers, currentQuestionIndex, selectAnswer, currentQuestion*/ 1081350) {
				each_value = /*currentQuestion*/ ctx[15].options;
				let i;

				for (i = 0; i < each_value.length; i += 1) {
					const child_ctx = get_each_context(ctx, each_value, i);

					if (each_blocks[i]) {
						each_blocks[i].p(child_ctx, dirty);
					} else {
						each_blocks[i] = create_each_block(child_ctx);
						each_blocks[i].c();
						each_blocks[i].m(div0, null);
					}
				}

				for (; i < each_blocks.length; i += 1) {
					each_blocks[i].d(1);
				}

				each_blocks.length = each_value.length;
			}
		},
		d(detaching) {
			if (detaching) detach(div1);
			destroy_each(each_blocks, detaching);
		}
	};
}

// (951:28) {#each currentQuestion.options as option, index}
function create_each_block(ctx) {
	let button;
	let span;
	let t0_value = String.fromCharCode(65 + /*index*/ ctx[41]) + "";
	let t0;
	let t1;
	let t2;
	let t3_value = /*option*/ ctx[39] + "";
	let t3;
	let t4;
	let mounted;
	let dispose;

	function click_handler_7() {
		return /*click_handler_7*/ ctx[32](/*index*/ ctx[41]);
	}

	return {
		c() {
			button = element("button");
			span = element("span");
			t0 = text(t0_value);
			t1 = text(".");
			t2 = space();
			t3 = text(t3_value);
			t4 = space();
			this.h();
		},
		l(nodes) {
			button = claim_element(nodes, "BUTTON", { class: true });
			var button_nodes = children(button);
			span = claim_element(button_nodes, "SPAN", { class: true });
			var span_nodes = children(span);
			t0 = claim_text(span_nodes, t0_value);
			t1 = claim_text(span_nodes, ".");
			span_nodes.forEach(detach);
			t2 = claim_space(button_nodes);
			t3 = claim_text(button_nodes, t3_value);
			t4 = claim_space(button_nodes);
			button_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(span, "class", "option-label svelte-1mb9on9");
			attr(button, "class", "option-button svelte-1mb9on9");
			toggle_class(button, "selected", /*selectedAnswers*/ ctx[2][/*currentQuestionIndex*/ ctx[1]] === /*index*/ ctx[41]);
		},
		m(target, anchor) {
			insert_hydration(target, button, anchor);
			append_hydration(button, span);
			append_hydration(span, t0);
			append_hydration(span, t1);
			append_hydration(button, t2);
			append_hydration(button, t3);
			append_hydration(button, t4);

			if (!mounted) {
				dispose = listen(button, "click", click_handler_7);
				mounted = true;
			}
		},
		p(new_ctx, dirty) {
			ctx = new_ctx;
			if (dirty[0] & /*currentQuestion*/ 32768 && t3_value !== (t3_value = /*option*/ ctx[39] + "")) set_data(t3, t3_value);

			if (dirty[0] & /*selectedAnswers, currentQuestionIndex*/ 6) {
				toggle_class(button, "selected", /*selectedAnswers*/ ctx[2][/*currentQuestionIndex*/ ctx[1]] === /*index*/ ctx[41]);
			}
		},
		d(detaching) {
			if (detaching) detach(button);
			mounted = false;
			dispose();
		}
	};
}

// (987:4) {#if showResultsModal}
function create_if_block(ctx) {
	let div5;
	let div4;
	let div0;
	let h2;
	let t0;
	let t1;
	let button0;
	let svg;
	let line0;
	let line1;
	let t2;
	let div3;
	let div1;
	let t3;
	let t4;
	let t5;
	let p0;
	let t6;
	let t7;
	let t8;
	let t9_value = /*currentQuestions*/ ctx[0].length + "";
	let t9;
	let t10;
	let t11;
	let p1;
	let t12;
	let p1_class_value;
	let t13;
	let div2;
	let button1;
	let t14;
	let t15;
	let button2;
	let t16;
	let mounted;
	let dispose;

	return {
		c() {
			div5 = element("div");
			div4 = element("div");
			div0 = element("div");
			h2 = element("h2");
			t0 = text("Test Results");
			t1 = space();
			button0 = element("button");
			svg = svg_element("svg");
			line0 = svg_element("line");
			line1 = svg_element("line");
			t2 = space();
			div3 = element("div");
			div1 = element("div");
			t3 = text(/*percentage*/ ctx[3]);
			t4 = text("%");
			t5 = space();
			p0 = element("p");
			t6 = text("You scored ");
			t7 = text(/*score*/ ctx[4]);
			t8 = text(" out of ");
			t9 = text(t9_value);
			t10 = text(" questions correctly.");
			t11 = space();
			p1 = element("p");
			t12 = text(/*scoreMessage*/ ctx[10]);
			t13 = space();
			div2 = element("div");
			button1 = element("button");
			t14 = text("Retake Test");
			t15 = space();
			button2 = element("button");
			t16 = text("Close");
			this.h();
		},
		l(nodes) {
			div5 = claim_element(nodes, "DIV", { class: true });
			var div5_nodes = children(div5);
			div4 = claim_element(div5_nodes, "DIV", { class: true });
			var div4_nodes = children(div4);
			div0 = claim_element(div4_nodes, "DIV", { class: true });
			var div0_nodes = children(div0);
			h2 = claim_element(div0_nodes, "H2", { class: true });
			var h2_nodes = children(h2);
			t0 = claim_text(h2_nodes, "Test Results");
			h2_nodes.forEach(detach);
			t1 = claim_space(div0_nodes);
			button0 = claim_element(div0_nodes, "BUTTON", { class: true });
			var button0_nodes = children(button0);

			svg = claim_svg_element(button0_nodes, "svg", {
				width: true,
				height: true,
				viewBox: true,
				fill: true,
				stroke: true,
				"stroke-width": true,
				class: true
			});

			var svg_nodes = children(svg);

			line0 = claim_svg_element(svg_nodes, "line", {
				x1: true,
				y1: true,
				x2: true,
				y2: true,
				class: true
			});

			children(line0).forEach(detach);

			line1 = claim_svg_element(svg_nodes, "line", {
				x1: true,
				y1: true,
				x2: true,
				y2: true,
				class: true
			});

			children(line1).forEach(detach);
			svg_nodes.forEach(detach);
			button0_nodes.forEach(detach);
			div0_nodes.forEach(detach);
			t2 = claim_space(div4_nodes);
			div3 = claim_element(div4_nodes, "DIV", { class: true });
			var div3_nodes = children(div3);
			div1 = claim_element(div3_nodes, "DIV", { class: true });
			var div1_nodes = children(div1);
			t3 = claim_text(div1_nodes, /*percentage*/ ctx[3]);
			t4 = claim_text(div1_nodes, "%");
			div1_nodes.forEach(detach);
			t5 = claim_space(div3_nodes);
			p0 = claim_element(div3_nodes, "P", { class: true });
			var p0_nodes = children(p0);
			t6 = claim_text(p0_nodes, "You scored ");
			t7 = claim_text(p0_nodes, /*score*/ ctx[4]);
			t8 = claim_text(p0_nodes, " out of ");
			t9 = claim_text(p0_nodes, t9_value);
			t10 = claim_text(p0_nodes, " questions correctly.");
			p0_nodes.forEach(detach);
			t11 = claim_space(div3_nodes);
			p1 = claim_element(div3_nodes, "P", { class: true });
			var p1_nodes = children(p1);
			t12 = claim_text(p1_nodes, /*scoreMessage*/ ctx[10]);
			p1_nodes.forEach(detach);
			t13 = claim_space(div3_nodes);
			div2 = claim_element(div3_nodes, "DIV", { class: true });
			var div2_nodes = children(div2);
			button1 = claim_element(div2_nodes, "BUTTON", { class: true });
			var button1_nodes = children(button1);
			t14 = claim_text(button1_nodes, "Retake Test");
			button1_nodes.forEach(detach);
			t15 = claim_space(div2_nodes);
			button2 = claim_element(div2_nodes, "BUTTON", { class: true });
			var button2_nodes = children(button2);
			t16 = claim_text(button2_nodes, "Close");
			button2_nodes.forEach(detach);
			div2_nodes.forEach(detach);
			div3_nodes.forEach(detach);
			div4_nodes.forEach(detach);
			div5_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(h2, "class", "modal-title svelte-1mb9on9");
			attr(line0, "x1", "18");
			attr(line0, "y1", "6");
			attr(line0, "x2", "6");
			attr(line0, "y2", "18");
			attr(line0, "class", "svelte-1mb9on9");
			attr(line1, "x1", "6");
			attr(line1, "y1", "6");
			attr(line1, "x2", "18");
			attr(line1, "y2", "18");
			attr(line1, "class", "svelte-1mb9on9");
			attr(svg, "width", "24");
			attr(svg, "height", "24");
			attr(svg, "viewBox", "0 0 24 24");
			attr(svg, "fill", "none");
			attr(svg, "stroke", "currentColor");
			attr(svg, "stroke-width", "2");
			attr(svg, "class", "svelte-1mb9on9");
			attr(button0, "class", "close-button svelte-1mb9on9");
			attr(div0, "class", "modal-header svelte-1mb9on9");
			attr(div1, "class", "score-display svelte-1mb9on9");
			attr(p0, "class", "score-text svelte-1mb9on9");
			attr(p1, "class", p1_class_value = "score-message " + /*scoreClass*/ ctx[9] + " svelte-1mb9on9");
			attr(button1, "class", "retake-button svelte-1mb9on9");
			attr(button2, "class", "close-results-button svelte-1mb9on9");
			attr(div2, "class", "results-buttons svelte-1mb9on9");
			attr(div3, "class", "results-container svelte-1mb9on9");
			attr(div4, "class", "modal svelte-1mb9on9");
			attr(div5, "class", "modal-overlay svelte-1mb9on9");
		},
		m(target, anchor) {
			insert_hydration(target, div5, anchor);
			append_hydration(div5, div4);
			append_hydration(div4, div0);
			append_hydration(div0, h2);
			append_hydration(h2, t0);
			append_hydration(div0, t1);
			append_hydration(div0, button0);
			append_hydration(button0, svg);
			append_hydration(svg, line0);
			append_hydration(svg, line1);
			append_hydration(div4, t2);
			append_hydration(div4, div3);
			append_hydration(div3, div1);
			append_hydration(div1, t3);
			append_hydration(div1, t4);
			append_hydration(div3, t5);
			append_hydration(div3, p0);
			append_hydration(p0, t6);
			append_hydration(p0, t7);
			append_hydration(p0, t8);
			append_hydration(p0, t9);
			append_hydration(p0, t10);
			append_hydration(div3, t11);
			append_hydration(div3, p1);
			append_hydration(p1, t12);
			append_hydration(div3, t13);
			append_hydration(div3, div2);
			append_hydration(div2, button1);
			append_hydration(button1, t14);
			append_hydration(div2, t15);
			append_hydration(div2, button2);
			append_hydration(button2, t16);

			if (!mounted) {
				dispose = [
					listen(button0, "click", /*closeResultsModal*/ ctx[19]),
					listen(button1, "click", /*retakeTest*/ ctx[23]),
					listen(button2, "click", /*closeResultsModal*/ ctx[19])
				];

				mounted = true;
			}
		},
		p(ctx, dirty) {
			if (dirty[0] & /*percentage*/ 8) set_data(t3, /*percentage*/ ctx[3]);
			if (dirty[0] & /*score*/ 16) set_data(t7, /*score*/ ctx[4]);
			if (dirty[0] & /*currentQuestions*/ 1 && t9_value !== (t9_value = /*currentQuestions*/ ctx[0].length + "")) set_data(t9, t9_value);
			if (dirty[0] & /*scoreMessage*/ 1024) set_data(t12, /*scoreMessage*/ ctx[10]);

			if (dirty[0] & /*scoreClass*/ 512 && p1_class_value !== (p1_class_value = "score-message " + /*scoreClass*/ ctx[9] + " svelte-1mb9on9")) {
				attr(p1, "class", p1_class_value);
			}
		},
		d(detaching) {
			if (detaching) detach(div5);
			mounted = false;
			run_all(dispose);
		}
	};
}

function create_fragment(ctx) {
	let main;
	let header;
	let div1;
	let div0;
	let span0;
	let t0;
	let t1;
	let span1;
	let t2;
	let t3;
	let nav;
	let a0;
	let t4;
	let t5;
	let section0;
	let div8;
	let div3;
	let div2;
	let span2;
	let t6;
	let t7;
	let h20;
	let t8;
	let t9;
	let p0;
	let t10;
	let t11;
	let p1;
	let t12;
	let t13;
	let div7;
	let div4;
	let button0;
	let svg0;
	let path0;
	let t14;
	let span3;
	let t15;
	let t16;
	let div5;
	let button1;
	let svg1;
	let rect;
	let path1;
	let line;
	let t17;
	let span4;
	let t18;
	let t19;
	let div6;
	let button2;
	let svg2;
	let path2;
	let t20;
	let span5;
	let t21;
	let t22;
	let section1;
	let h21;
	let t23;
	let t24;
	let p2;
	let t25;
	let t26;
	let div9;
	let button3;
	let t27;
	let t28;
	let section2;
	let h22;
	let t29;
	let t30;
	let div10;
	let button4;
	let span6;
	let t31;
	let t32;
	let svg3;
	let polyline0;
	let t33;
	let t34;
	let div11;
	let button5;
	let span7;
	let t35;
	let t36;
	let svg4;
	let polyline1;
	let t37;
	let t38;
	let div12;
	let button6;
	let span8;
	let t39;
	let t40;
	let svg5;
	let polyline2;
	let t41;
	let t42;
	let footer;
	let div15;
	let div13;
	let a1;
	let t43;
	let t44;
	let a2;
	let t45;
	let t46;
	let a3;
	let t47;
	let t48;
	let div14;
	let t49;
	let t50;
	let t51;
	let mounted;
	let dispose;
	let if_block0 = /*expandedSections*/ ctx[8][0] && create_if_block_5(ctx);
	let if_block1 = /*expandedSections*/ ctx[8][1] && create_if_block_4(ctx);
	let if_block2 = /*expandedSections*/ ctx[8][2] && create_if_block_3(ctx);
	let if_block3 = /*showModal*/ ctx[6] && create_if_block_1(ctx);
	let if_block4 = /*showResultsModal*/ ctx[7] && create_if_block(ctx);

	return {
		c() {
			main = element("main");
			header = element("header");
			div1 = element("div");
			div0 = element("div");
			span0 = element("span");
			t0 = text("📚");
			t1 = space();
			span1 = element("span");
			t2 = text("EduPath");
			t3 = space();
			nav = element("nav");
			a0 = element("a");
			t4 = text("Home");
			t5 = space();
			section0 = element("section");
			div8 = element("div");
			div3 = element("div");
			div2 = element("div");
			span2 = element("span");
			t6 = text("👩‍🏫");
			t7 = space();
			h20 = element("h2");
			t8 = text("Mr. Abdelfatah Ahmed");
			t9 = space();
			p0 = element("p");
			t10 = text("Expert in English Language");
			t11 = space();
			p1 = element("p");
			t12 = text("Connect with me on");
			t13 = space();
			div7 = element("div");
			div4 = element("div");
			button0 = element("button");
			svg0 = svg_element("svg");
			path0 = svg_element("path");
			t14 = space();
			span3 = element("span");
			t15 = text("Twitter");
			t16 = space();
			div5 = element("div");
			button1 = element("button");
			svg1 = svg_element("svg");
			rect = svg_element("rect");
			path1 = svg_element("path");
			line = svg_element("line");
			t17 = space();
			span4 = element("span");
			t18 = text("Instagram");
			t19 = space();
			div6 = element("div");
			button2 = element("button");
			svg2 = svg_element("svg");
			path2 = svg_element("path");
			t20 = space();
			span5 = element("span");
			t21 = text("Facebook");
			t22 = space();
			section1 = element("section");
			h21 = element("h2");
			t23 = text("Course Introduction");
			t24 = space();
			p2 = element("p");
			t25 = text("Welcome to my English language course! Whether you're a beginner, intermediate, or advanced learner, I have tailored \n            programs to suit your needs. Each level is designed to enhance your language skills progressively. Take the placement test to \n            find your level, or explore the course details below.");
			t26 = space();
			div9 = element("div");
			button3 = element("button");
			t27 = text("Take Placement Test");
			t28 = space();
			section2 = element("section");
			h22 = element("h2");
			t29 = text("Course Details");
			t30 = space();
			div10 = element("div");
			button4 = element("button");
			span6 = element("span");
			t31 = text("Beginner Level");
			t32 = space();
			svg3 = svg_element("svg");
			polyline0 = svg_element("polyline");
			t33 = space();
			if (if_block0) if_block0.c();
			t34 = space();
			div11 = element("div");
			button5 = element("button");
			span7 = element("span");
			t35 = text("Intermediate Level");
			t36 = space();
			svg4 = svg_element("svg");
			polyline1 = svg_element("polyline");
			t37 = space();
			if (if_block1) if_block1.c();
			t38 = space();
			div12 = element("div");
			button6 = element("button");
			span8 = element("span");
			t39 = text("Advanced Level");
			t40 = space();
			svg5 = svg_element("svg");
			polyline2 = svg_element("polyline");
			t41 = space();
			if (if_block2) if_block2.c();
			t42 = space();
			footer = element("footer");
			div15 = element("div");
			div13 = element("div");
			a1 = element("a");
			t43 = text("Contact Us");
			t44 = space();
			a2 = element("a");
			t45 = text("Privacy Policy");
			t46 = space();
			a3 = element("a");
			t47 = text("Terms of Service");
			t48 = space();
			div14 = element("div");
			t49 = text("©2024 EduPath. All rights reserved.");
			t50 = space();
			if (if_block3) if_block3.c();
			t51 = space();
			if (if_block4) if_block4.c();
			this.h();
		},
		l(nodes) {
			main = claim_element(nodes, "MAIN", { class: true });
			var main_nodes = children(main);
			header = claim_element(main_nodes, "HEADER", { class: true });
			var header_nodes = children(header);
			div1 = claim_element(header_nodes, "DIV", { class: true });
			var div1_nodes = children(div1);
			div0 = claim_element(div1_nodes, "DIV", { class: true });
			var div0_nodes = children(div0);
			span0 = claim_element(div0_nodes, "SPAN", { class: true });
			var span0_nodes = children(span0);
			t0 = claim_text(span0_nodes, "📚");
			span0_nodes.forEach(detach);
			t1 = claim_space(div0_nodes);
			span1 = claim_element(div0_nodes, "SPAN", { class: true });
			var span1_nodes = children(span1);
			t2 = claim_text(span1_nodes, "EduPath");
			span1_nodes.forEach(detach);
			div0_nodes.forEach(detach);
			t3 = claim_space(div1_nodes);
			nav = claim_element(div1_nodes, "NAV", { class: true });
			var nav_nodes = children(nav);
			a0 = claim_element(nav_nodes, "A", { href: true, class: true });
			var a0_nodes = children(a0);
			t4 = claim_text(a0_nodes, "Home");
			a0_nodes.forEach(detach);
			nav_nodes.forEach(detach);
			div1_nodes.forEach(detach);
			header_nodes.forEach(detach);
			t5 = claim_space(main_nodes);
			section0 = claim_element(main_nodes, "SECTION", { class: true });
			var section0_nodes = children(section0);
			div8 = claim_element(section0_nodes, "DIV", { class: true });
			var div8_nodes = children(div8);
			div3 = claim_element(div8_nodes, "DIV", { class: true });
			var div3_nodes = children(div3);
			div2 = claim_element(div3_nodes, "DIV", { class: true });
			var div2_nodes = children(div2);
			span2 = claim_element(div2_nodes, "SPAN", { class: true });
			var span2_nodes = children(span2);
			t6 = claim_text(span2_nodes, "👩‍🏫");
			span2_nodes.forEach(detach);
			div2_nodes.forEach(detach);
			div3_nodes.forEach(detach);
			t7 = claim_space(div8_nodes);
			h20 = claim_element(div8_nodes, "H2", { class: true });
			var h20_nodes = children(h20);
			t8 = claim_text(h20_nodes, "Mr. Abdelfatah Ahmed");
			h20_nodes.forEach(detach);
			t9 = claim_space(div8_nodes);
			p0 = claim_element(div8_nodes, "P", { class: true });
			var p0_nodes = children(p0);
			t10 = claim_text(p0_nodes, "Expert in English Language");
			p0_nodes.forEach(detach);
			t11 = claim_space(div8_nodes);
			p1 = claim_element(div8_nodes, "P", { class: true });
			var p1_nodes = children(p1);
			t12 = claim_text(p1_nodes, "Connect with me on");
			p1_nodes.forEach(detach);
			t13 = claim_space(div8_nodes);
			div7 = claim_element(div8_nodes, "DIV", { class: true });
			var div7_nodes = children(div7);
			div4 = claim_element(div7_nodes, "DIV", { class: true });
			var div4_nodes = children(div4);
			button0 = claim_element(div4_nodes, "BUTTON", { class: true });
			var button0_nodes = children(button0);

			svg0 = claim_svg_element(button0_nodes, "svg", {
				width: true,
				height: true,
				viewBox: true,
				fill: true,
				stroke: true,
				"stroke-width": true,
				class: true
			});

			var svg0_nodes = children(svg0);
			path0 = claim_svg_element(svg0_nodes, "path", { d: true, class: true });
			children(path0).forEach(detach);
			svg0_nodes.forEach(detach);
			button0_nodes.forEach(detach);
			t14 = claim_space(div4_nodes);
			span3 = claim_element(div4_nodes, "SPAN", { class: true });
			var span3_nodes = children(span3);
			t15 = claim_text(span3_nodes, "Twitter");
			span3_nodes.forEach(detach);
			div4_nodes.forEach(detach);
			t16 = claim_space(div7_nodes);
			div5 = claim_element(div7_nodes, "DIV", { class: true });
			var div5_nodes = children(div5);
			button1 = claim_element(div5_nodes, "BUTTON", { class: true });
			var button1_nodes = children(button1);

			svg1 = claim_svg_element(button1_nodes, "svg", {
				width: true,
				height: true,
				viewBox: true,
				fill: true,
				stroke: true,
				"stroke-width": true,
				class: true
			});

			var svg1_nodes = children(svg1);

			rect = claim_svg_element(svg1_nodes, "rect", {
				width: true,
				height: true,
				x: true,
				y: true,
				rx: true,
				ry: true,
				class: true
			});

			children(rect).forEach(detach);
			path1 = claim_svg_element(svg1_nodes, "path", { d: true, class: true });
			children(path1).forEach(detach);

			line = claim_svg_element(svg1_nodes, "line", {
				x1: true,
				x2: true,
				y1: true,
				y2: true,
				class: true
			});

			children(line).forEach(detach);
			svg1_nodes.forEach(detach);
			button1_nodes.forEach(detach);
			t17 = claim_space(div5_nodes);
			span4 = claim_element(div5_nodes, "SPAN", { class: true });
			var span4_nodes = children(span4);
			t18 = claim_text(span4_nodes, "Instagram");
			span4_nodes.forEach(detach);
			div5_nodes.forEach(detach);
			t19 = claim_space(div7_nodes);
			div6 = claim_element(div7_nodes, "DIV", { class: true });
			var div6_nodes = children(div6);
			button2 = claim_element(div6_nodes, "BUTTON", { class: true });
			var button2_nodes = children(button2);

			svg2 = claim_svg_element(button2_nodes, "svg", {
				width: true,
				height: true,
				viewBox: true,
				fill: true,
				stroke: true,
				"stroke-width": true,
				class: true
			});

			var svg2_nodes = children(svg2);
			path2 = claim_svg_element(svg2_nodes, "path", { d: true, class: true });
			children(path2).forEach(detach);
			svg2_nodes.forEach(detach);
			button2_nodes.forEach(detach);
			t20 = claim_space(div6_nodes);
			span5 = claim_element(div6_nodes, "SPAN", { class: true });
			var span5_nodes = children(span5);
			t21 = claim_text(span5_nodes, "Facebook");
			span5_nodes.forEach(detach);
			div6_nodes.forEach(detach);
			div7_nodes.forEach(detach);
			div8_nodes.forEach(detach);
			section0_nodes.forEach(detach);
			t22 = claim_space(main_nodes);
			section1 = claim_element(main_nodes, "SECTION", { class: true });
			var section1_nodes = children(section1);
			h21 = claim_element(section1_nodes, "H2", { class: true });
			var h21_nodes = children(h21);
			t23 = claim_text(h21_nodes, "Course Introduction");
			h21_nodes.forEach(detach);
			t24 = claim_space(section1_nodes);
			p2 = claim_element(section1_nodes, "P", { class: true });
			var p2_nodes = children(p2);
			t25 = claim_text(p2_nodes, "Welcome to my English language course! Whether you're a beginner, intermediate, or advanced learner, I have tailored \n            programs to suit your needs. Each level is designed to enhance your language skills progressively. Take the placement test to \n            find your level, or explore the course details below.");
			p2_nodes.forEach(detach);
			t26 = claim_space(section1_nodes);
			div9 = claim_element(section1_nodes, "DIV", { class: true });
			var div9_nodes = children(div9);
			button3 = claim_element(div9_nodes, "BUTTON", { class: true });
			var button3_nodes = children(button3);
			t27 = claim_text(button3_nodes, "Take Placement Test");
			button3_nodes.forEach(detach);
			div9_nodes.forEach(detach);
			section1_nodes.forEach(detach);
			t28 = claim_space(main_nodes);
			section2 = claim_element(main_nodes, "SECTION", { class: true });
			var section2_nodes = children(section2);
			h22 = claim_element(section2_nodes, "H2", { class: true });
			var h22_nodes = children(h22);
			t29 = claim_text(h22_nodes, "Course Details");
			h22_nodes.forEach(detach);
			t30 = claim_space(section2_nodes);
			div10 = claim_element(section2_nodes, "DIV", { class: true });
			var div10_nodes = children(div10);
			button4 = claim_element(div10_nodes, "BUTTON", { class: true });
			var button4_nodes = children(button4);
			span6 = claim_element(button4_nodes, "SPAN", { class: true });
			var span6_nodes = children(span6);
			t31 = claim_text(span6_nodes, "Beginner Level");
			span6_nodes.forEach(detach);
			t32 = claim_space(button4_nodes);

			svg3 = claim_svg_element(button4_nodes, "svg", {
				class: true,
				viewBox: true,
				fill: true,
				stroke: true,
				"stroke-width": true
			});

			var svg3_nodes = children(svg3);
			polyline0 = claim_svg_element(svg3_nodes, "polyline", { points: true, class: true });
			children(polyline0).forEach(detach);
			svg3_nodes.forEach(detach);
			button4_nodes.forEach(detach);
			t33 = claim_space(div10_nodes);
			if (if_block0) if_block0.l(div10_nodes);
			div10_nodes.forEach(detach);
			t34 = claim_space(section2_nodes);
			div11 = claim_element(section2_nodes, "DIV", { class: true });
			var div11_nodes = children(div11);
			button5 = claim_element(div11_nodes, "BUTTON", { class: true });
			var button5_nodes = children(button5);
			span7 = claim_element(button5_nodes, "SPAN", { class: true });
			var span7_nodes = children(span7);
			t35 = claim_text(span7_nodes, "Intermediate Level");
			span7_nodes.forEach(detach);
			t36 = claim_space(button5_nodes);

			svg4 = claim_svg_element(button5_nodes, "svg", {
				class: true,
				viewBox: true,
				fill: true,
				stroke: true,
				"stroke-width": true
			});

			var svg4_nodes = children(svg4);
			polyline1 = claim_svg_element(svg4_nodes, "polyline", { points: true, class: true });
			children(polyline1).forEach(detach);
			svg4_nodes.forEach(detach);
			button5_nodes.forEach(detach);
			t37 = claim_space(div11_nodes);
			if (if_block1) if_block1.l(div11_nodes);
			div11_nodes.forEach(detach);
			t38 = claim_space(section2_nodes);
			div12 = claim_element(section2_nodes, "DIV", { class: true });
			var div12_nodes = children(div12);
			button6 = claim_element(div12_nodes, "BUTTON", { class: true });
			var button6_nodes = children(button6);
			span8 = claim_element(button6_nodes, "SPAN", { class: true });
			var span8_nodes = children(span8);
			t39 = claim_text(span8_nodes, "Advanced Level");
			span8_nodes.forEach(detach);
			t40 = claim_space(button6_nodes);

			svg5 = claim_svg_element(button6_nodes, "svg", {
				class: true,
				viewBox: true,
				fill: true,
				stroke: true,
				"stroke-width": true
			});

			var svg5_nodes = children(svg5);
			polyline2 = claim_svg_element(svg5_nodes, "polyline", { points: true, class: true });
			children(polyline2).forEach(detach);
			svg5_nodes.forEach(detach);
			button6_nodes.forEach(detach);
			t41 = claim_space(div12_nodes);
			if (if_block2) if_block2.l(div12_nodes);
			div12_nodes.forEach(detach);
			section2_nodes.forEach(detach);
			t42 = claim_space(main_nodes);
			footer = claim_element(main_nodes, "FOOTER", { class: true });
			var footer_nodes = children(footer);
			div15 = claim_element(footer_nodes, "DIV", { class: true });
			var div15_nodes = children(div15);
			div13 = claim_element(div15_nodes, "DIV", { class: true });
			var div13_nodes = children(div13);
			a1 = claim_element(div13_nodes, "A", { href: true, class: true });
			var a1_nodes = children(a1);
			t43 = claim_text(a1_nodes, "Contact Us");
			a1_nodes.forEach(detach);
			t44 = claim_space(div13_nodes);
			a2 = claim_element(div13_nodes, "A", { href: true, class: true });
			var a2_nodes = children(a2);
			t45 = claim_text(a2_nodes, "Privacy Policy");
			a2_nodes.forEach(detach);
			t46 = claim_space(div13_nodes);
			a3 = claim_element(div13_nodes, "A", { href: true, class: true });
			var a3_nodes = children(a3);
			t47 = claim_text(a3_nodes, "Terms of Service");
			a3_nodes.forEach(detach);
			div13_nodes.forEach(detach);
			t48 = claim_space(div15_nodes);
			div14 = claim_element(div15_nodes, "DIV", { class: true });
			var div14_nodes = children(div14);
			t49 = claim_text(div14_nodes, "©2024 EduPath. All rights reserved.");
			div14_nodes.forEach(detach);
			div15_nodes.forEach(detach);
			footer_nodes.forEach(detach);
			t50 = claim_space(main_nodes);
			if (if_block3) if_block3.l(main_nodes);
			t51 = claim_space(main_nodes);
			if (if_block4) if_block4.l(main_nodes);
			main_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(span0, "class", "logo-icon svelte-1mb9on9");
			attr(span1, "class", "logo-text svelte-1mb9on9");
			attr(div0, "class", "logo svelte-1mb9on9");
			attr(a0, "href", "/");
			attr(a0, "class", "svelte-1mb9on9");
			attr(nav, "class", "nav svelte-1mb9on9");
			attr(div1, "class", "header-container svelte-1mb9on9");
			attr(header, "class", "header svelte-1mb9on9");
			attr(span2, "class", "svelte-1mb9on9");
			attr(div2, "class", "instructor-avatar-inner svelte-1mb9on9");
			attr(div3, "class", "instructor-avatar svelte-1mb9on9");
			attr(h20, "class", "instructor-name svelte-1mb9on9");
			attr(p0, "class", "instructor-title svelte-1mb9on9");
			attr(p1, "class", "instructor-connect svelte-1mb9on9");
			attr(path0, "d", "M23 3a10.9 10.9 0 0 1-3.14 1.53 4.48 4.48 0 0 0-7.86 3v1A10.66 10.66 0 0 1 3 4s-4 9 5 13a11.64 11.64 0 0 1-7 2c9 5 20 0 20-11.5a4.5 4.5 0 0 0-.08-.83A7.72 7.72 0 0 0 23 3z");
			attr(path0, "class", "svelte-1mb9on9");
			attr(svg0, "width", "20");
			attr(svg0, "height", "20");
			attr(svg0, "viewBox", "0 0 24 24");
			attr(svg0, "fill", "none");
			attr(svg0, "stroke", "#3b82f6");
			attr(svg0, "stroke-width", "2");
			attr(svg0, "class", "svelte-1mb9on9");
			attr(button0, "class", "social-button svelte-1mb9on9");
			attr(span3, "class", "social-label svelte-1mb9on9");
			attr(div4, "class", "social-link svelte-1mb9on9");
			attr(rect, "width", "20");
			attr(rect, "height", "20");
			attr(rect, "x", "2");
			attr(rect, "y", "2");
			attr(rect, "rx", "5");
			attr(rect, "ry", "5");
			attr(rect, "class", "svelte-1mb9on9");
			attr(path1, "d", "M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z");
			attr(path1, "class", "svelte-1mb9on9");
			attr(line, "x1", "17.5");
			attr(line, "x2", "17.51");
			attr(line, "y1", "6.5");
			attr(line, "y2", "6.5");
			attr(line, "class", "svelte-1mb9on9");
			attr(svg1, "width", "20");
			attr(svg1, "height", "20");
			attr(svg1, "viewBox", "0 0 24 24");
			attr(svg1, "fill", "none");
			attr(svg1, "stroke", "#ec4899");
			attr(svg1, "stroke-width", "2");
			attr(svg1, "class", "svelte-1mb9on9");
			attr(button1, "class", "social-button svelte-1mb9on9");
			attr(span4, "class", "social-label svelte-1mb9on9");
			attr(div5, "class", "social-link svelte-1mb9on9");
			attr(path2, "d", "M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z");
			attr(path2, "class", "svelte-1mb9on9");
			attr(svg2, "width", "20");
			attr(svg2, "height", "20");
			attr(svg2, "viewBox", "0 0 24 24");
			attr(svg2, "fill", "none");
			attr(svg2, "stroke", "#2563eb");
			attr(svg2, "stroke-width", "2");
			attr(svg2, "class", "svelte-1mb9on9");
			attr(button2, "class", "social-button svelte-1mb9on9");
			attr(span5, "class", "social-label svelte-1mb9on9");
			attr(div6, "class", "social-link svelte-1mb9on9");
			attr(div7, "class", "social-links svelte-1mb9on9");
			attr(div8, "class", "instructor-container svelte-1mb9on9");
			attr(section0, "class", "instructor-profile svelte-1mb9on9");
			attr(h21, "class", "svelte-1mb9on9");
			attr(p2, "class", "svelte-1mb9on9");
			attr(button3, "class", "primary-button svelte-1mb9on9");
			attr(div9, "class", "intro-button-container svelte-1mb9on9");
			attr(section1, "class", "course-intro svelte-1mb9on9");
			attr(h22, "class", "svelte-1mb9on9");
			attr(span6, "class", "section-title svelte-1mb9on9");
			attr(polyline0, "points", "6,9 12,15 18,9");
			attr(polyline0, "class", "svelte-1mb9on9");
			attr(svg3, "class", "chevron svelte-1mb9on9");
			attr(svg3, "viewBox", "0 0 24 24");
			attr(svg3, "fill", "none");
			attr(svg3, "stroke", "currentColor");
			attr(svg3, "stroke-width", "2");
			toggle_class(svg3, "expanded", /*expandedSections*/ ctx[8][0]);
			attr(button4, "class", "section-header svelte-1mb9on9");
			attr(div10, "class", "course-section svelte-1mb9on9");
			attr(span7, "class", "section-title svelte-1mb9on9");
			attr(polyline1, "points", "6,9 12,15 18,9");
			attr(polyline1, "class", "svelte-1mb9on9");
			attr(svg4, "class", "chevron svelte-1mb9on9");
			attr(svg4, "viewBox", "0 0 24 24");
			attr(svg4, "fill", "none");
			attr(svg4, "stroke", "currentColor");
			attr(svg4, "stroke-width", "2");
			toggle_class(svg4, "expanded", /*expandedSections*/ ctx[8][1]);
			attr(button5, "class", "section-header svelte-1mb9on9");
			attr(div11, "class", "course-section svelte-1mb9on9");
			attr(span8, "class", "section-title svelte-1mb9on9");
			attr(polyline2, "points", "6,9 12,15 18,9");
			attr(polyline2, "class", "svelte-1mb9on9");
			attr(svg5, "class", "chevron svelte-1mb9on9");
			attr(svg5, "viewBox", "0 0 24 24");
			attr(svg5, "fill", "none");
			attr(svg5, "stroke", "currentColor");
			attr(svg5, "stroke-width", "2");
			toggle_class(svg5, "expanded", /*expandedSections*/ ctx[8][2]);
			attr(button6, "class", "section-header svelte-1mb9on9");
			attr(div12, "class", "course-section svelte-1mb9on9");
			attr(section2, "class", "course-details svelte-1mb9on9");
			attr(a1, "href", "/");
			attr(a1, "class", "svelte-1mb9on9");
			attr(a2, "href", "/");
			attr(a2, "class", "svelte-1mb9on9");
			attr(a3, "href", "/");
			attr(a3, "class", "svelte-1mb9on9");
			attr(div13, "class", "footer-links svelte-1mb9on9");
			attr(div14, "class", "footer-copyright svelte-1mb9on9");
			attr(div15, "class", "footer-container svelte-1mb9on9");
			attr(footer, "class", "footer svelte-1mb9on9");
			attr(main, "class", "svelte-1mb9on9");
		},
		m(target, anchor) {
			insert_hydration(target, main, anchor);
			append_hydration(main, header);
			append_hydration(header, div1);
			append_hydration(div1, div0);
			append_hydration(div0, span0);
			append_hydration(span0, t0);
			append_hydration(div0, t1);
			append_hydration(div0, span1);
			append_hydration(span1, t2);
			append_hydration(div1, t3);
			append_hydration(div1, nav);
			append_hydration(nav, a0);
			append_hydration(a0, t4);
			append_hydration(main, t5);
			append_hydration(main, section0);
			append_hydration(section0, div8);
			append_hydration(div8, div3);
			append_hydration(div3, div2);
			append_hydration(div2, span2);
			append_hydration(span2, t6);
			append_hydration(div8, t7);
			append_hydration(div8, h20);
			append_hydration(h20, t8);
			append_hydration(div8, t9);
			append_hydration(div8, p0);
			append_hydration(p0, t10);
			append_hydration(div8, t11);
			append_hydration(div8, p1);
			append_hydration(p1, t12);
			append_hydration(div8, t13);
			append_hydration(div8, div7);
			append_hydration(div7, div4);
			append_hydration(div4, button0);
			append_hydration(button0, svg0);
			append_hydration(svg0, path0);
			append_hydration(div4, t14);
			append_hydration(div4, span3);
			append_hydration(span3, t15);
			append_hydration(div7, t16);
			append_hydration(div7, div5);
			append_hydration(div5, button1);
			append_hydration(button1, svg1);
			append_hydration(svg1, rect);
			append_hydration(svg1, path1);
			append_hydration(svg1, line);
			append_hydration(div5, t17);
			append_hydration(div5, span4);
			append_hydration(span4, t18);
			append_hydration(div7, t19);
			append_hydration(div7, div6);
			append_hydration(div6, button2);
			append_hydration(button2, svg2);
			append_hydration(svg2, path2);
			append_hydration(div6, t20);
			append_hydration(div6, span5);
			append_hydration(span5, t21);
			append_hydration(main, t22);
			append_hydration(main, section1);
			append_hydration(section1, h21);
			append_hydration(h21, t23);
			append_hydration(section1, t24);
			append_hydration(section1, p2);
			append_hydration(p2, t25);
			append_hydration(section1, t26);
			append_hydration(section1, div9);
			append_hydration(div9, button3);
			append_hydration(button3, t27);
			append_hydration(main, t28);
			append_hydration(main, section2);
			append_hydration(section2, h22);
			append_hydration(h22, t29);
			append_hydration(section2, t30);
			append_hydration(section2, div10);
			append_hydration(div10, button4);
			append_hydration(button4, span6);
			append_hydration(span6, t31);
			append_hydration(button4, t32);
			append_hydration(button4, svg3);
			append_hydration(svg3, polyline0);
			append_hydration(div10, t33);
			if (if_block0) if_block0.m(div10, null);
			append_hydration(section2, t34);
			append_hydration(section2, div11);
			append_hydration(div11, button5);
			append_hydration(button5, span7);
			append_hydration(span7, t35);
			append_hydration(button5, t36);
			append_hydration(button5, svg4);
			append_hydration(svg4, polyline1);
			append_hydration(div11, t37);
			if (if_block1) if_block1.m(div11, null);
			append_hydration(section2, t38);
			append_hydration(section2, div12);
			append_hydration(div12, button6);
			append_hydration(button6, span8);
			append_hydration(span8, t39);
			append_hydration(button6, t40);
			append_hydration(button6, svg5);
			append_hydration(svg5, polyline2);
			append_hydration(div12, t41);
			if (if_block2) if_block2.m(div12, null);
			append_hydration(main, t42);
			append_hydration(main, footer);
			append_hydration(footer, div15);
			append_hydration(div15, div13);
			append_hydration(div13, a1);
			append_hydration(a1, t43);
			append_hydration(div13, t44);
			append_hydration(div13, a2);
			append_hydration(a2, t45);
			append_hydration(div13, t46);
			append_hydration(div13, a3);
			append_hydration(a3, t47);
			append_hydration(div15, t48);
			append_hydration(div15, div14);
			append_hydration(div14, t49);
			append_hydration(main, t50);
			if (if_block3) if_block3.m(main, null);
			append_hydration(main, t51);
			if (if_block4) if_block4.m(main, null);

			if (!mounted) {
				dispose = [
					listen(button3, "click", /*click_handler*/ ctx[25]),
					listen(button4, "click", /*click_handler_1*/ ctx[26]),
					listen(button5, "click", /*click_handler_3*/ ctx[28]),
					listen(button6, "click", /*click_handler_5*/ ctx[30])
				];

				mounted = true;
			}
		},
		p(ctx, dirty) {
			if (dirty[0] & /*expandedSections*/ 256) {
				toggle_class(svg3, "expanded", /*expandedSections*/ ctx[8][0]);
			}

			if (/*expandedSections*/ ctx[8][0]) {
				if (if_block0) {
					if_block0.p(ctx, dirty);
				} else {
					if_block0 = create_if_block_5(ctx);
					if_block0.c();
					if_block0.m(div10, null);
				}
			} else if (if_block0) {
				if_block0.d(1);
				if_block0 = null;
			}

			if (dirty[0] & /*expandedSections*/ 256) {
				toggle_class(svg4, "expanded", /*expandedSections*/ ctx[8][1]);
			}

			if (/*expandedSections*/ ctx[8][1]) {
				if (if_block1) {
					if_block1.p(ctx, dirty);
				} else {
					if_block1 = create_if_block_4(ctx);
					if_block1.c();
					if_block1.m(div11, null);
				}
			} else if (if_block1) {
				if_block1.d(1);
				if_block1 = null;
			}

			if (dirty[0] & /*expandedSections*/ 256) {
				toggle_class(svg5, "expanded", /*expandedSections*/ ctx[8][2]);
			}

			if (/*expandedSections*/ ctx[8][2]) {
				if (if_block2) {
					if_block2.p(ctx, dirty);
				} else {
					if_block2 = create_if_block_3(ctx);
					if_block2.c();
					if_block2.m(div12, null);
				}
			} else if (if_block2) {
				if_block2.d(1);
				if_block2 = null;
			}

			if (/*showModal*/ ctx[6]) {
				if (if_block3) {
					if_block3.p(ctx, dirty);
				} else {
					if_block3 = create_if_block_1(ctx);
					if_block3.c();
					if_block3.m(main, t51);
				}
			} else if (if_block3) {
				if_block3.d(1);
				if_block3 = null;
			}

			if (/*showResultsModal*/ ctx[7]) {
				if (if_block4) {
					if_block4.p(ctx, dirty);
				} else {
					if_block4 = create_if_block(ctx);
					if_block4.c();
					if_block4.m(main, null);
				}
			} else if (if_block4) {
				if_block4.d(1);
				if_block4 = null;
			}
		},
		i: noop,
		o: noop,
		d(detaching) {
			if (detaching) detach(main);
			if (if_block0) if_block0.d();
			if (if_block1) if_block1.d();
			if (if_block2) if_block2.d();
			if (if_block3) if_block3.d();
			if (if_block4) if_block4.d();
			mounted = false;
			run_all(dispose);
		}
	};
}

function instance($$self, $$props, $$invalidate) {
	let currentQuestion;
	let progress;
	let isLastQuestion;
	let canGoNext;
	let canGoPrev;
	let score;
	let percentage;
	let scoreMessage;
	let scoreClass;
	let { props } = $$props;

	// Test questions data
	const placementQuestions = [
		{
			id: 1,
			question: "What is the correct form of the verb 'to be' in this sentence: 'She ___ a teacher.'",
			options: ["am", "is", "are", "be"],
			correctAnswer: 1
		},
		{
			id: 2,
			question: "Choose the correct article: '___ apple a day keeps the doctor away.'",
			options: ["A", "An", "The", "No article needed"],
			correctAnswer: 1
		},
		{
			id: 3,
			question: "Which sentence is grammatically correct?",
			options: [
				"I have went to the store",
				"I have gone to the store",
				"I have go to the store",
				"I have going to the store"
			],
			correctAnswer: 1
		},
		{
			id: 4,
			question: "What is the past tense of 'run'?",
			options: ["runned", "ran", "run", "running"],
			correctAnswer: 1
		},
		{
			id: 5,
			question: "Choose the correct preposition: 'The book is ___ the table.'",
			options: ["in", "at", "on", "by"],
			correctAnswer: 2
		}
	];

	const weeklyQuestions = [
		{
			id: 1,
			question: "Which word is a synonym for 'happy'?",
			options: ["sad", "joyful", "angry", "tired"],
			correctAnswer: 1
		},
		{
			id: 2,
			question: "What type of word is 'quickly' in the sentence 'She ran quickly'?",
			options: ["noun", "verb", "adjective", "adverb"],
			correctAnswer: 3
		},
		{
			id: 3,
			question: "Choose the correct spelling:",
			options: ["recieve", "receive", "receeve", "receve"],
			correctAnswer: 1
		},
		{
			id: 4,
			question: "What is the plural form of 'child'?",
			options: ["childs", "childes", "children", "child"],
			correctAnswer: 2
		},
		{
			id: 5,
			question: "Which sentence uses the correct punctuation?",
			options: [
				"Hello, how are you",
				"Hello how are you?",
				"Hello, how are you?",
				"Hello; how are you"
			],
			correctAnswer: 2
		}
	];

	// Test state - using reactive variables
	let currentTestType = 'placement';

	let currentQuestions = [];
	let currentQuestionIndex = 0;
	let selectedAnswers = [];
	let showModal = false;
	let showResultsModal = false;
	let expandedSections = { 0: true, 1: true, 2: true };

	// Section toggle functionality
	function toggleSection(index) {
		$$invalidate(8, expandedSections[index] = !expandedSections[index], expandedSections);
	}

	// Modal functionality
	function openModal(testType) {
		$$invalidate(5, currentTestType = testType);

		$$invalidate(0, currentQuestions = testType === 'placement'
		? placementQuestions
		: weeklyQuestions);

		$$invalidate(1, currentQuestionIndex = 0);
		$$invalidate(2, selectedAnswers = []);
		$$invalidate(6, showModal = true);
	}

	function closeModal() {
		$$invalidate(6, showModal = false);
	}

	function closeResultsModal() {
		$$invalidate(7, showResultsModal = false);
	}

	function selectAnswer(answerIndex) {
		$$invalidate(2, selectedAnswers[currentQuestionIndex] = answerIndex, selectedAnswers);

		// Trigger reactivity
		$$invalidate(2, selectedAnswers);
	}

	function previousQuestion() {
		if (currentQuestionIndex > 0) {
			$$invalidate(1, currentQuestionIndex--, currentQuestionIndex);
		}
	}

	function nextQuestion() {
		if (currentQuestionIndex < currentQuestions.length - 1) {
			$$invalidate(1, currentQuestionIndex++, currentQuestionIndex);
		} else {
			showTestResults();
		}
	}

	function showTestResults() {
		calculateScore();
		$$invalidate(6, showModal = false);
		$$invalidate(7, showResultsModal = true);
	}

	function calculateScore() {
		let correct = 0;

		selectedAnswers.forEach((answer, index) => {
			if (answer === currentQuestions[index].correctAnswer) {
				correct++;
			}
		});

		return correct;
	}

	function retakeTest() {
		closeResultsModal();
		openModal(currentTestType);
	}

	const click_handler = () => openModal('placement');
	const click_handler_1 = () => toggleSection(0);
	const click_handler_2 = () => openModal('weekly');
	const click_handler_3 = () => toggleSection(1);
	const click_handler_4 = () => openModal('weekly');
	const click_handler_5 = () => toggleSection(2);
	const click_handler_6 = () => openModal('weekly');
	const click_handler_7 = index => selectAnswer(index);

	$$self.$$set = $$props => {
		if ('props' in $$props) $$invalidate(24, props = $$props.props);
	};

	$$self.$$.update = () => {
		if ($$self.$$.dirty[0] & /*currentQuestions, currentQuestionIndex*/ 3) {
			// Reactive variables for UI updates
			$$invalidate(15, currentQuestion = currentQuestions[currentQuestionIndex]);
		}

		if ($$self.$$.dirty[0] & /*currentQuestions, currentQuestionIndex*/ 3) {
			$$invalidate(14, progress = currentQuestions.length > 0
			? (currentQuestionIndex + 1) / currentQuestions.length * 100
			: 0);
		}

		if ($$self.$$.dirty[0] & /*currentQuestionIndex, currentQuestions*/ 3) {
			$$invalidate(13, isLastQuestion = currentQuestionIndex === currentQuestions.length - 1);
		}

		if ($$self.$$.dirty[0] & /*selectedAnswers, currentQuestionIndex*/ 6) {
			$$invalidate(12, canGoNext = selectedAnswers[currentQuestionIndex] !== undefined);
		}

		if ($$self.$$.dirty[0] & /*currentQuestionIndex*/ 2) {
			$$invalidate(11, canGoPrev = currentQuestionIndex > 0);
		}

		if ($$self.$$.dirty[0] & /*currentQuestions, score*/ 17) {
			$$invalidate(3, percentage = currentQuestions.length > 0
			? Math.round(score / currentQuestions.length * 100)
			: 0);
		}

		if ($$self.$$.dirty[0] & /*percentage*/ 8) {
			$$invalidate(10, scoreMessage = percentage >= 80
			? 'Excellent work! 🎉'
			: percentage >= 60
				? 'Good job! Keep practicing! 👍'
				: 'Keep studying and try again! 💪');
		}

		if ($$self.$$.dirty[0] & /*percentage*/ 8) {
			$$invalidate(9, scoreClass = percentage >= 80
			? 'excellent'
			: percentage >= 60 ? 'good' : 'needs-improvement');
		}
	};

	$$invalidate(4, score = calculateScore());

	return [
		currentQuestions,
		currentQuestionIndex,
		selectedAnswers,
		percentage,
		score,
		currentTestType,
		showModal,
		showResultsModal,
		expandedSections,
		scoreClass,
		scoreMessage,
		canGoPrev,
		canGoNext,
		isLastQuestion,
		progress,
		currentQuestion,
		toggleSection,
		openModal,
		closeModal,
		closeResultsModal,
		selectAnswer,
		previousQuestion,
		nextQuestion,
		retakeTest,
		props,
		click_handler,
		click_handler_1,
		click_handler_2,
		click_handler_3,
		click_handler_4,
		click_handler_5,
		click_handler_6,
		click_handler_7
	];
}

class Component extends SvelteComponent {
	constructor(options) {
		super();
		init(this, options, instance, create_fragment, safe_not_equal, { props: 24 }, null, [-1, -1]);
	}
}

export { Component as default };
