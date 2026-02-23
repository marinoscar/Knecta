import { Logger } from '@nestjs/common';
import { SpreadsheetAgentStateType } from '../state';
import { ValidationReport } from '../types';
import { EmitFn } from '../graph';

const logger = new Logger('ValidateNode');

export function createValidateNode(emit: EmitFn) {
  return async (state: SpreadsheetAgentStateType): Promise<Partial<SpreadsheetAgentStateType>> => {
    emit({ type: 'phase_start', phase: 'validate', label: 'Validating results' });

    const { extractionResults, extractionPlan } = state;

    if (!extractionPlan || extractionResults.length === 0) {
      emit({ type: 'phase_complete', phase: 'validate' });
      return {
        currentPhase: 'validate',
        validationReport: {
          passed: false,
          tables: [],
          diagnosis: 'No extraction results to validate',
          recommendedTarget: 'extractor',
        },
      };
    }

    const tableReports: ValidationReport['tables'] = [];
    let allPassed = true;
    let diagnosis: string | null = null;
    let recommendedTarget: ValidationReport['recommendedTarget'] = null;

    for (const result of extractionResults) {
      const checks: Array<{ name: string; passed: boolean; message: string }> = [];
      let tablePassed = true;

      // Find the corresponding plan entry
      const planTable = extractionPlan.tables.find(
        (t) => t.tableName === result.tableName,
      );

      // Check 1: Extraction status
      if (result.status === 'failed') {
        checks.push({
          name: 'extraction_status',
          passed: false,
          message: `Extraction failed: ${result.error || 'Unknown error'}`,
        });
        tablePassed = false;
      } else {
        checks.push({ name: 'extraction_status', passed: true, message: 'Extraction succeeded' });
      }

      // Check 2: Row count sanity
      if (result.status === 'success') {
        if (result.rowCount === 0) {
          checks.push({
            name: 'row_count',
            passed: false,
            message: 'Extracted 0 rows — table appears empty',
          });
          tablePassed = false;
        } else if (planTable && planTable.estimatedRows > 0) {
          const ratio = result.rowCount / planTable.estimatedRows;
          if (ratio > 2 || ratio < 0.1) {
            checks.push({
              name: 'row_count',
              passed: false,
              message: `Row count ${result.rowCount} is ${ratio > 2 ? 'significantly higher' : 'significantly lower'} than estimated ${planTable.estimatedRows} (ratio: ${ratio.toFixed(2)})`,
            });
            tablePassed = false;
          } else {
            checks.push({
              name: 'row_count',
              passed: true,
              message: `Row count ${result.rowCount} is within expected range (estimated: ${planTable.estimatedRows})`,
            });
          }
        } else {
          checks.push({ name: 'row_count', passed: true, message: `Extracted ${result.rowCount} rows` });
        }
      }

      // Check 3: NULL ratio for non-nullable columns
      if (result.status === 'success' && result.rowCount > 0 && planTable) {
        const nonNullableColumns = planTable.columns.filter((c) => !c.nullable);
        for (const col of nonNullableColumns) {
          const resultCol = result.columns.find((rc) => rc.name === col.outputName);
          if (resultCol && resultCol.nullCount > 0) {
            const nullRatio = resultCol.nullCount / result.rowCount;
            if (nullRatio > 0.8) {
              checks.push({
                name: `null_check_${col.outputName}`,
                passed: false,
                message: `Non-nullable column "${col.outputName}" has ${(nullRatio * 100).toFixed(1)}% NULLs (${resultCol.nullCount}/${result.rowCount})`,
              });
              tablePassed = false;
            } else if (nullRatio > 0) {
              checks.push({
                name: `null_check_${col.outputName}`,
                passed: true,
                message: `Non-nullable column "${col.outputName}" has ${resultCol.nullCount} NULLs (${(nullRatio * 100).toFixed(1)}%) — acceptable`,
              });
            }
          }
        }
      }

      // Check 4: Column count matches plan
      if (result.status === 'success' && planTable) {
        if (result.columns.length !== planTable.columns.length) {
          checks.push({
            name: 'column_count',
            passed: false,
            message: `Extracted ${result.columns.length} columns but plan specified ${planTable.columns.length}`,
          });
          tablePassed = false;
        } else {
          checks.push({
            name: 'column_count',
            passed: true,
            message: `Column count matches plan: ${result.columns.length}`,
          });
        }
      }

      if (!tablePassed) allPassed = false;

      logger.debug(
        `Table "${result.tableName}" validation: ${tablePassed ? 'passed' : 'failed'} (${checks.length} checks)`,
      );

      emit({
        type: 'validation_result',
        tableId: result.tableId,
        passed: tablePassed,
        checks,
      });

      tableReports.push({
        tableName: result.tableName,
        passed: tablePassed,
        checks,
      });
    }

    // Determine diagnosis and target for revision
    if (!allPassed) {
      const failedChecks = tableReports
        .filter((t) => !t.passed)
        .flatMap((t) => t.checks.filter((c) => !c.passed));

      const hasSchemaIssues = failedChecks.some(
        (c) => c.name === 'column_count' || c.name.startsWith('null_check'),
      );
      const hasExtractionIssues = failedChecks.some(
        (c) => c.name === 'row_count' || c.name === 'extraction_status',
      );

      if (hasSchemaIssues) {
        diagnosis = `Schema issues detected: ${failedChecks.map((c) => c.message).join('; ')}`;
        recommendedTarget = 'schema_designer';
      } else if (hasExtractionIssues) {
        diagnosis = `Extraction issues detected: ${failedChecks.map((c) => c.message).join('; ')}`;
        recommendedTarget = 'extractor';
      } else {
        diagnosis = `Validation issues: ${failedChecks.map((c) => c.message).join('; ')}`;
        recommendedTarget = 'extractor';
      }

      logger.warn(`Validation failed: ${diagnosis}`);
    } else {
      logger.log(`Validation passed for all ${tableReports.length} tables`);
    }

    const report: ValidationReport = {
      passed: allPassed,
      tables: tableReports,
      diagnosis,
      recommendedTarget,
    };

    emit({
      type: 'progress',
      completedFiles: state.fileInventory.length,
      totalFiles: state.fileInventory.length,
      completedSheets: state.sheetAnalyses.length,
      totalSheets: state.sheetAnalyses.length,
      completedTables: extractionResults.filter((r) => r.status === 'success').length,
      totalTables: extractionResults.length,
      percentComplete: 90, // Phase 6 = 80-90%
    });

    emit({ type: 'phase_complete', phase: 'validate' });

    return {
      currentPhase: 'validate',
      validationReport: report,
      revisionDiagnosis: diagnosis,
    };
  };
}
