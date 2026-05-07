from score import calc_final_score
from Level_1 import analyze_level1
from Level_2 import analyze_level2
from Level_3 import analyze_level3

def main(excel_file="output.xlsx", output_file="final_analysis.xlsx"):
    level1_results = analyze_level1(excel_file)
    level2_results = analyze_level2(excel_file)
    level3_results = analyze_level3(excel_file)
    final_results = calc_final_score(level1_results, level2_results, level3_results)
    final_results.to_excel(output_file, index=False)
    return final_results


if __name__ == "__main__":
    main()
