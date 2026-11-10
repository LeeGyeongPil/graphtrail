# 보안 정책 / Security policy

보안 취약점을 발견하셨다면 **공개 이슈 대신** 이 레포의 **Security → Report a vulnerability**(비공개 취약점 신고)로 알려 주세요. 확인 후 답변드리고, 고친 버전을 릴리스하면서 함께 안내합니다.

If you find a security issue, please **do not open a public issue**. Use **Security → Report a vulnerability** in this repository to report it privately. We will reply after checking and announce the fix with a release.

graphtrail 은 신뢰할 수 없는 체크포인트 파일을 코드 실행 없이 읽는 것을 목표로 합니다. 파일 내용으로 코드가 실행되거나 원본 파일이 바뀌거나 네트워크 접속이 일어나는 경우는 취약점으로 보고해 주세요. / graphtrail aims to read untrusted checkpoint files without executing anything. Code execution, modification of the input file, or network access triggered by file content counts as a vulnerability.
