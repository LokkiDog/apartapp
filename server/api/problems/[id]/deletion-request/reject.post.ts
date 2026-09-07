import { requireActor } from '../../../../infrastructure/auth/actor'
import { decideProblemDeletion } from '../../../../modules/problem/problem.service'
export default defineEventHandler(async event => decideProblemDeletion(await requireActor(event), getRouterParam(event, 'id')!, false))
