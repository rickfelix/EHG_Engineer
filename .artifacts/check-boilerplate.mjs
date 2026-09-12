import { RetrospectiveQualityRubric } from '../scripts/modules/rubrics/retrospective-quality-rubric.js';
import { retrospective } from './insert-parent-retro.mjs';

const result = RetrospectiveQualityRubric.detectBoilerplate(retrospective);
console.log(JSON.stringify(result, null, 2));

const fieldValidation = new RetrospectiveQualityRubric().validateRetrospectiveFields(retrospective);
console.log('Field validation:', JSON.stringify(fieldValidation, null, 2));
