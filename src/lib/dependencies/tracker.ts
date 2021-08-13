
export interface DependencyVec<T> {
    key: string | symbol;
    value: T;
    dependsOn: Set<string | symbol | T>;
    // disjoint?: Array<String | symbol>;
}

export class DependencyError extends Error {

}

export class DependencyTracker<T> {

    vecs: Map<string | symbol, DependencyVec<T>> = new Map();
    revVecs: Map<T, DependencyVec<T>> = new Map();

    lookup(handle: T | string | symbol) {
        let r: DependencyVec<T> | undefined = undefined;
        if (typeof handle === 'string' || typeof handle === 'symbol') {
            r = this.vecs.get(handle);
        }
        if (r === undefined) {
            r = this.revVecs.get(handle as T);
        }

        return r;
    }

    _autoAdd(value: T | string | symbol) {
        const oldVec = this.lookup(value);

        if (oldVec) {
            return oldVec;
        }

        if (typeof value === 'function') {
            const newVec: DependencyVec<T> = { key: value.name, value, dependsOn: new Set() };
            if (this.vecs.has(newVec.key)) {
                throw new DependencyError(`Duplicated dependency ${String(newVec.key)}`);
            }
            this.vecs.set(newVec.key, newVec);
            this.revVecs.set(newVec.value, newVec);

            return newVec;
        }

        throw new DependencyError(`Failed dependency ${String(value)}`);
    }

    track(vec: DependencyVec<T>) {
        const vecIndexed = this.vecs.get(vec.key);

        const revVecIndexed = this.revVecs.get(vec.value);

        const targetVec = vecIndexed || revVecIndexed || vec;

        this.vecs.delete(targetVec.key);
        this.revVecs.delete(targetVec.value);

        const dependencies = Array.from(targetVec.dependsOn).map((x) => this._autoAdd(x));

        targetVec.dependsOn.clear();
        dependencies.forEach((x) => targetVec.dependsOn.add(x.value));

        this.vecs.set(targetVec.key, targetVec);
        this.revVecs.set(targetVec.value, targetVec);

        return targetVec;
    }

    addDependency(handle: string | symbol | T, dependsOn: T | string | symbol) {
        const profile = this._autoAdd(handle);

        const depended = this._autoAdd(dependsOn);

        profile.dependsOn.add(depended.value);
    }

    solve(handle: T | string | symbol, _dedupSet: Set<T> = new Set()): T[][] {
        const vec = this.lookup(handle);
        if (!vec) {
            throw new DependencyError(`Failed dependency ${String(handle)}`);
        }

        _dedupSet.add(vec.value);

        if (vec.dependsOn.size === 0) {
            return [[vec.value]];
        }

        const depLayer = Array.from(vec.dependsOn)
            .map((x) => this.revVecs.get(x as T)!.value)
            .filter((x) => !_dedupSet.has(x));

        
        const deepResult = [];
        for (const dep of depLayer) {
            const depChain = this.solve(dep, _dedupSet);
            for (const [i, depVal] of depChain.reverse().entries()) {
                let resultTarget: T[] = deepResult[i];
                if (!resultTarget) {
                    resultTarget = [];
                    deepResult[i] = resultTarget;
                }
                resultTarget.push(...depVal as T[]);
            }
        }

        return [...deepResult, [vec.value]];
    }
}
